import { type Prisma } from '@prisma/client';
import { type PrismaDatabase } from '../../../shared/infrastructure/prisma-database';
import { DomainError } from '../../../shared/domain/errors';
import { type Uuid } from '../../../shared/domain/identifier';
import {
  type DemandPriorityCounts,
  type DemandStatusCounts,
  type EffectivePermissionsResolver,
  type UserListFilter,
  type UserPageView,
  type UserQueries,
  type UserRepository,
  type UserWithRoleView,
} from '../application/ports/repositories';
import { type PermissionCode } from '../domain/permission';
import { PermissionSet } from '../domain/permission-set';
import { type User } from '../domain/user';
import { UserMapper } from './mappers';

const EMPTY_PRIORITY_COUNTS: DemandPriorityCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 };
const EMPTY_STATUS_COUNTS: DemandStatusCounts = {
  NOT_STARTED: 0,
  IN_PROGRESS: 0,
  PAUSED: 0,
  IN_REVIEW: 0,
  PRODUCTION: 0,
};

function whereFromFilter(filter: UserListFilter = {}): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (filter.activeOnly) {
    // Excluded accounts are always inactive too; stating both keeps the login picker
    // correct even for a row someone edited by hand.
    where.active = true;
    where.deletedAt = null;
  }
  if (filter.active !== undefined) {
    where.active = filter.active;
  }
  if (filter.search?.trim()) {
    where.name = { contains: filter.search.trim() };
  }
  if (filter.roleUuid) {
    where.role = { uuid: filter.roleUuid.toString() };
  }
  return where;
}

export class PrismaUserRepository implements UserRepository, UserQueries {
  constructor(private readonly database: PrismaDatabase) {}

  /** The open unit of work's transaction when there is one; the root client otherwise. */
  private get prisma() {
    return this.database.client;
  }

  async findByUuid(uuid: Uuid): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { uuid: uuid.toString() },
      include: { role: { select: { uuid: true } } },
    });
    return row ? UserMapper.toDomain(row) : null;
  }

  async list(filter: UserListFilter = {}): Promise<User[]> {
    const rows = await this.prisma.user.findMany({
      where: whereFromFilter(filter),
      include: { role: { select: { uuid: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(UserMapper.toDomain);
  }

  async create(user: User): Promise<User> {
    const role = await this.requireRole(user.roleUuid);
    const row = await this.prisma.user.create({
      data: {
        uuid: user.uuid.toString(),
        name: user.name,
        avatarUrl: user.avatarUrl,
        roleId: role.id,
        active: user.active,
      },
      include: { role: { select: { uuid: true } } },
    });
    return UserMapper.toDomain(row);
  }

  async update(user: User): Promise<User> {
    const role = await this.requireRole(user.roleUuid);
    const row = await this.prisma.user.update({
      where: { uuid: user.uuid.toString() },
      data: {
        name: user.name,
        avatarUrl: user.avatarUrl,
        roleId: role.id,
        active: user.active,
        deletedAt: user.deletedAt,
      },
      include: { role: { select: { uuid: true } } },
    });
    return UserMapper.toDomain(row);
  }

  async existsByName(name: string, exceptUuid?: Uuid): Promise<boolean> {
    const found = await this.prisma.user.findFirst({
      where: { name },
      select: { uuid: true },
    });
    if (!found) {
      return false;
    }
    return exceptUuid ? found.uuid !== exceptUuid.toString() : true;
  }

  // --- UserQueries (read model) ---

  async listWithRole(filter: UserListFilter = {}): Promise<UserWithRoleView[]> {
    const rows = await this.prisma.user.findMany({
      where: whereFromFilter(filter),
      include: { role: { select: { uuid: true, name: true, slug: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(toView);
  }

  async listWithRolePage(
    filter: UserListFilter,
    page: { page: number; limit: number },
  ): Promise<UserPageView> {
    const where = whereFromFilter(filter);
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { role: { select: { uuid: true, name: true, slug: true } } },
        // Most recent first, then uuid descending as the tiebreaker: two accounts can
        // share a `createdAt` millisecond, and pagination drifts between requests
        // without a fully deterministic order — the same reasoning the log listing
        // follows for `(occurred_at, uuid)`.
        orderBy: [{ createdAt: 'desc' }, { uuid: 'desc' }],
        skip: (page.page - 1) * page.limit,
        take: page.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    const [priorityCounts, statusCounts] = await Promise.all([
      this.priorityCountsByUser(rows.map((row) => row.id)),
      this.statusCountsByUser(rows.map((row) => row.id)),
    ]);
    return {
      items: rows.map((row) => ({
        ...toView(row),
        demandPriorityCounts: priorityCounts.get(row.id.toString()) ?? EMPTY_PRIORITY_COUNTS,
        demandStatusCounts: statusCounts.get(row.id.toString()) ?? EMPTY_STATUS_COUNTS,
      })),
      total,
    };
  }

  /**
   * One `groupBy` for the whole page rather than one query per row — the table's demand
   * counts must not turn into N+1 the moment an installation has real headcount.
   */
  private async priorityCountsByUser(userIds: bigint[]): Promise<Map<string, DemandPriorityCounts>> {
    if (userIds.length === 0) {
      return new Map();
    }
    const groups = await this.prisma.demand.groupBy({
      by: ['responsibleUserId', 'priority'],
      // Neither archived nor delivered: a workload count is about open work still on the
      // board. PRODUCTION is the terminal status — counting it in would show a number
      // that never goes down for work that is actually done.
      where: { responsibleUserId: { in: userIds }, archived: false, status: { not: 'PRODUCTION' } },
      _count: { _all: true },
    });
    const byUser = new Map<string, DemandPriorityCounts>();
    for (const group of groups) {
      const key = group.responsibleUserId.toString();
      const counts = byUser.get(key) ?? { ...EMPTY_PRIORITY_COUNTS };
      counts[group.priority] = group._count._all;
      byUser.set(key, counts);
    }
    return byUser;
  }

  /**
   * Same one-`groupBy`-per-page shape as `priorityCountsByUser`, but by status and
   * including `PRODUCTION` — here the point is "how far along", so concluídas count too.
   */
  private async statusCountsByUser(userIds: bigint[]): Promise<Map<string, DemandStatusCounts>> {
    if (userIds.length === 0) {
      return new Map();
    }
    const groups = await this.prisma.demand.groupBy({
      by: ['responsibleUserId', 'status'],
      where: { responsibleUserId: { in: userIds }, archived: false },
      _count: { _all: true },
    });
    const byUser = new Map<string, DemandStatusCounts>();
    for (const group of groups) {
      const key = group.responsibleUserId.toString();
      const counts = byUser.get(key) ?? { ...EMPTY_STATUS_COUNTS };
      counts[group.status] = group._count._all;
      byUser.set(key, counts);
    }
    return byUser;
  }

  async findWithRole(uuid: Uuid): Promise<UserWithRoleView | null> {
    const row = await this.prisma.user.findUnique({
      where: { uuid: uuid.toString() },
      include: { role: { select: { uuid: true, name: true, slug: true } } },
    });
    return row ? toView(row) : null;
  }

  private async requireRole(roleUuid: Uuid): Promise<{ id: bigint }> {
    const role = await this.prisma.role.findUnique({
      where: { uuid: roleUuid.toString() },
      select: { id: true, active: true },
    });
    if (!role) {
      throw DomainError.notFound('ROLE_NOT_FOUND', 'Perfil não encontrado.');
    }
    if (!role.active) {
      throw DomainError.validation('ROLE_INACTIVE', 'O perfil selecionado está inativo.');
    }
    return { id: role.id };
  }
}

function toView(row: {
  uuid: string;
  name: string;
  avatarUrl: string | null;
  active: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  role: { uuid: string; name: string; slug: string };
}): UserWithRoleView {
  return {
    userUuid: row.uuid,
    name: row.name,
    avatarUrl: row.avatarUrl,
    active: row.active,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    role: { uuid: row.role.uuid, name: row.role.name, slug: row.role.slug },
  };
}

/**
 * Resolves permissions per request straight from the database.
 *
 * The alternative — baking the matrix into the JWT — makes permission changes take
 * effect only after every outstanding token expires. Correctness of authorization
 * outweighs saving one indexed lookup per request here.
 */
export class PrismaEffectivePermissionsResolver implements EffectivePermissionsResolver {
  constructor(private readonly database: PrismaDatabase) {}

  /** The open unit of work's transaction when there is one; the root client otherwise. */
  private get prisma() {
    return this.database.client;
  }

  async resolve(userUuid: Uuid) {
    const row = await this.prisma.user.findUnique({
      where: { uuid: userUuid.toString() },
      select: {
        uuid: true,
        name: true,
        avatarUrl: true,
        active: true,
        deletedAt: true,
        role: {
          select: {
            uuid: true,
            slug: true,
            name: true,
            active: true,
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });

    if (!row) {
      return null;
    }

    // An inactive role must not keep conferring authority on its members.
    const codes = row.role.active ? row.role.permissions.map((rp) => rp.permission.code) : [];

    return {
      userUuid: row.uuid,
      name: row.name,
      avatarUrl: row.avatarUrl,
      // Excluded accounts never authenticate, even if a row was ever left active by hand —
      // the same belt-and-braces the domain applies in User.setActive.
      active: row.active && row.deletedAt === null,
      roleUuid: row.role.uuid,
      roleSlug: row.role.slug,
      roleName: row.role.name,
      permissions: PermissionSet.fromCodes(codes).toArray() as PermissionCode[],
    };
  }
}
