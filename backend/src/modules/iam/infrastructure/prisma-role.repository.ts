import { DomainError } from '../../../shared/domain/errors';
import { type PrismaDatabase } from '../../../shared/infrastructure/prisma-database';
import { type Uuid } from '../../../shared/domain/identifier';
import { type RoleRepository } from '../application/ports/repositories';
import { type Role } from '../domain/role';
import { RoleMapper } from './mappers';

const WITH_PERMISSIONS = {
  permissions: { include: { permission: { select: { code: true } } } },
} as const;

export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly database: PrismaDatabase) {}

  /** The open unit of work's transaction when there is one; the root client otherwise. */
  private get prisma() {
    return this.database.client;
  }

  async findByUuid(uuid: Uuid): Promise<Role | null> {
    const row = await this.prisma.role.findUnique({
      where: { uuid: uuid.toString() },
      include: WITH_PERMISSIONS,
    });
    return row ? RoleMapper.toDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<Role | null> {
    const row = await this.prisma.role.findUnique({ where: { slug }, include: WITH_PERMISSIONS });
    return row ? RoleMapper.toDomain(row) : null;
  }

  async listAll(filter: { activeOnly?: boolean } = {}): Promise<Role[]> {
    const rows = await this.prisma.role.findMany({
      where: filter.activeOnly ? { active: true } : {},
      include: WITH_PERMISSIONS,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return rows.map(RoleMapper.toDomain);
  }

  async create(role: Role): Promise<Role> {
    const permissionIds = await this.resolvePermissionIds(role);

    // A role and its grants must appear together or not at all: a role persisted
    // without its permissions is a silently powerless profile.
    const row = await this.database.transaction(async (tx) => {
      const createdRole = await tx.role.create({
        data: {
          uuid: role.uuid.toString(),
          name: role.name,
          slug: role.slug,
          isSystem: role.isSystem,
          active: role.active,
        },
      });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: createdRole.id, permissionId })),
        });
      }
      return tx.role.findUniqueOrThrow({
        where: { id: createdRole.id },
        include: WITH_PERMISSIONS,
      });
    });

    return RoleMapper.toDomain(row);
  }

  async update(role: Role): Promise<Role> {
    const permissionIds = await this.resolvePermissionIds(role);

    const row = await this.database.transaction(async (tx) => {
      const existing = await tx.role.findUnique({ where: { uuid: role.uuid.toString() } });
      if (!existing) {
        throw DomainError.notFound('ROLE_NOT_FOUND', 'Perfil não encontrado.');
      }
      await tx.role.update({
        where: { id: existing.id },
        data: { name: role.name, slug: role.slug, active: role.active },
      });
      // Replace the grant set wholesale — computing a diff would add complexity for a
      // set that is a handful of rows wide.
      await tx.rolePermission.deleteMany({ where: { roleId: existing.id } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: existing.id, permissionId })),
        });
      }
      return tx.role.findUniqueOrThrow({ where: { id: existing.id }, include: WITH_PERMISSIONS });
    });

    return RoleMapper.toDomain(row);
  }

  async existsBySlug(slug: string, exceptUuid?: Uuid): Promise<boolean> {
    const found = await this.prisma.role.findUnique({ where: { slug }, select: { uuid: true } });
    if (!found) {
      return false;
    }
    return exceptUuid ? found.uuid !== exceptUuid.toString() : true;
  }

  private async resolvePermissionIds(role: Role): Promise<bigint[]> {
    const codes = role.permissions.toArray();
    if (codes.length === 0) {
      return [];
    }
    const rows = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
