import { type Prisma } from '@prisma/client';
import { type PrismaDatabase } from '../../../shared/infrastructure/prisma-database';
import { CalendarDate } from '../../../shared/domain/calendar-date';
import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';
import {
  type AssigneeDirectory,
  type AttachmentRepository,
  type DemandCardView,
  type DemandListFilter,
  type DemandQueries,
  type DemandRepository,
  type DemandSort,
} from '../application/ports/repositories';
import { type DemandPage } from '../application/demand-page';
import { type AssigneeCandidate } from '../domain/assignee-eligibility';
import { ChecklistItem } from '../domain/checklist-item';
import { Demand } from '../domain/demand';
import { RichText } from '../domain/rich-text';
import { DemandAttachment } from '../domain/demand-attachment';
import { demandState } from '../domain/demand-status';

const DEMAND_INCLUDE = {
  project: { select: { uuid: true, name: true } },
  responsible: { select: { uuid: true, name: true, avatarUrl: true, active: true, deletedAt: true } },
  createdBy: { select: { uuid: true, name: true } },
  attachments: {
    select: {
      uuid: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      storageKey: true,
      thumbnailKey: true,
      createdAt: true,
      createdBy: { select: { uuid: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  checklist: {
    select: { uuid: true, title: true, done: true, position: true },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.DemandInclude;

type DemandRow = Prisma.DemandGetPayload<{ include: typeof DEMAND_INCLUDE }>;

const DemandMapper = {
  toDomain(row: DemandRow): Demand {
    return Demand.rehydrate({
      uuid: Uuid.create(row.uuid),
      projectUuid: row.project ? Uuid.create(row.project.uuid) : null,
      title: row.title,
      // Stored markup has already passed the sanitizer on the way in, so rehydration
      // re-validates shape without re-sanitizing.
      description: RichText.fromSanitizedHtml(row.description),
      dueDate: CalendarDate.fromDate(row.dueDate),
      state: demandState(row.status),
      priority: row.priority,
      archived: row.archived,
      responsibleUserUuid: Uuid.create(row.responsible.uuid),
      createdByUserUuid: Uuid.create(row.createdBy.uuid),
      attachments: row.attachments.map((attachment) =>
        DemandAttachment.rehydrate({
          uuid: Uuid.create(attachment.uuid),
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          storageKey: attachment.storageKey,
          thumbnailKey: attachment.thumbnailKey,
          createdByUserUuid: Uuid.create(attachment.createdBy.uuid),
          createdAt: attachment.createdAt,
        }),
      ),
      checklist: row.checklist.map((item) =>
        ChecklistItem.rehydrate({
          uuid: Uuid.create(item.uuid),
          title: item.title,
          done: item.done,
          position: item.position,
        }),
      ),
    });
  },
};

function whereFromFilter(filter: DemandListFilter): Prisma.DemandWhereInput {
  const where: Prisma.DemandWhereInput = {};
  /*
   * Every clause below is ANDed as a separate entry rather than assigned onto `where`
   * directly: the visibility rule and the free-text search both need an `OR` of their
   * own, and a single `where.OR` would let one silently overwrite — and therefore
   * widen — the other.
   */
  const and: Prisma.DemandWhereInput[] = [];

  const projectWhere: Prisma.ProjectWhereInput = {};

  // `null` means unrestricted; an empty array must yield no rows, not every row.
  if (filter.restrictToProjectUuids != null) {
    projectWhere.uuid = { in: [...filter.restrictToProjectUuids] };
  }
  if (filter.projectUuid) {
    // Intersected rather than overwritten: asking for one project must never widen
    // the actor's visibility beyond the projects they are allowed to see.
    projectWhere.AND = [{ uuid: filter.projectUuid.toString() }];
  }
  if (Object.keys(projectWhere).length > 0) {
    // A demand with no project is outside the allocation boundary rather than refused by
    // it — there is no project whose membership could be checked. What bounds those is
    // `restrictToOwnerUuid`. Asking for one project explicitly is the exception: `null`
    // is not that project, so detached demands drop out on their own.
    and.push(
      filter.projectUuid
        ? { project: projectWhere }
        : { OR: [{ projectId: null }, { project: projectWhere }] },
    );
  }
  /*
   * The DEMAND_VIEW_ALL-less reading: the board becomes the actor's own work queue.
   * "Own" includes what they created, not only what they were assigned — otherwise
   * someone who may create demands but not be an assignee would write one and
   * immediately lose sight of it.
   */
  if (filter.restrictToOwnerUuid) {
    and.push({
      OR: [
        { responsible: { uuid: filter.restrictToOwnerUuid } },
        { createdBy: { uuid: filter.restrictToOwnerUuid } },
      ],
    });
  }
  if (filter.archived !== undefined) {
    where.archived = filter.archived;
  }
  if (filter.status) {
    where.status = filter.status;
  }
  if (filter.priority) {
    where.priority = filter.priority;
  }
  if (filter.responsibleUuid) {
    where.responsible = { uuid: filter.responsibleUuid.toString() };
  }
  if (filter.search?.trim()) {
    const search = filter.search.trim();
    and.push({
      OR: [
        { title: { contains: search } },
        { description: { contains: search } },
        { responsible: { name: { contains: search } } },
      ],
    });
  }
  if (and.length > 0) {
    where.AND = and;
  }
  return where;
}

/**
 * `uuid` closes every ordering as the final tiebreak, the same reasoning
 * `ix_demands_project_status_due` and the Logs store's own ordering follow: the primary
 * column is rarely unique on its own (two demands can share a due date, a creation
 * instant, or a priority), and pagination drifts between requests without a stable,
 * fully-deterministic order.
 */
function orderByFromSort(sort: DemandSort | undefined): Prisma.DemandOrderByWithRelationInput[] {
  switch (sort) {
    case 'createdAt':
      return [{ createdAt: 'desc' }, { uuid: 'asc' }];
    case 'priority':
      // MySQL orders an ENUM by its declared index, not alphabetically — DemandPriority
      // is declared LOW, MEDIUM, HIGH, URGENT in schema.prisma for exactly this reason,
      // so `desc` reads as "most urgent first" with no CASE expression needed.
      return [{ priority: 'desc' }, { dueDate: 'asc' }, { uuid: 'asc' }];
    case 'dueDate':
    default:
      // Matches the tail of ix_demands_project_status_due, so the database walks the
      // index in order instead of sorting the matching rows.
      return [{ dueDate: 'asc' }, { uuid: 'asc' }];
  }
}

export class PrismaDemandRepository implements DemandRepository, DemandQueries {
  constructor(private readonly database: PrismaDatabase) {}

  /** The open unit of work's transaction when there is one; the root client otherwise. */
  private get prisma() {
    return this.database.client;
  }

  async findByUuid(uuid: Uuid): Promise<Demand | null> {
    const row = await this.prisma.demand.findUnique({
      where: { uuid: uuid.toString() },
      include: DEMAND_INCLUDE,
    });
    return row ? DemandMapper.toDomain(row) : null;
  }

  async create(demand: Demand): Promise<Demand> {
    const refs = await this.resolveRefs(
      demand.projectUuid,
      demand.responsibleUserUuid,
      demand.createdByUserUuid,
    );
    const row = await this.prisma.demand.create({
      data: {
        uuid: demand.uuid.toString(),
        projectId: refs.projectId,
        title: demand.title,
        description: demand.description.toString(),
        // UTC midnight is the only representation that survives a MySQL DATE round
        // trip without drifting a day in either direction.
        dueDate: demand.dueDate.toUTCDate(),
        status: demand.status,
        priority: demand.priority,
        archived: demand.archived,
        responsibleUserId: refs.responsibleId,
        createdByUserId: refs.createdById,
        // Nested create: the aggregate arrives whole, so it is written whole. Prisma
        // wraps a nested create in the same transaction as its parent.
        checklist: {
          create: demand.checklist.map((item) => ({
            uuid: item.uuid.toString(),
            title: item.title,
            done: item.done,
            position: item.position,
          })),
        },
      },
      include: DEMAND_INCLUDE,
    });
    return DemandMapper.toDomain(row);
  }

  /**
   * Persists the aggregate, checklist included.
   *
   * One transaction, because the checklist is part of the demand: a demand saved with
   * half of its list applied is a state the aggregate's invariants say cannot exist, and
   * the database is the only place that can still guarantee that once the process is
   * out of the picture.
   *
   * Items are reconciled by `uuid` rather than deleted and re-inserted, so identifiers
   * stay stable for anything already holding one.
   */
  async update(demand: Demand): Promise<Demand> {
    const refs = await this.resolveRefs(
      demand.projectUuid,
      demand.responsibleUserUuid,
      demand.createdByUserUuid,
    );
    const checklist = demand.checklist;
    const keptUuids = checklist.map((item) => item.uuid.toString());

    const row = await this.database.transaction(async (tx) => {
      const updated = await tx.demand.update({
        where: { uuid: demand.uuid.toString() },
        data: {
          projectId: refs.projectId,
          title: demand.title,
          description: demand.description.toString(),
          dueDate: demand.dueDate.toUTCDate(),
          status: demand.status,
          priority: demand.priority,
          archived: demand.archived,
          responsibleUserId: refs.responsibleId,
        },
        select: { id: true },
      });

      await tx.demandChecklistItem.deleteMany({
        where: { demandId: updated.id, uuid: { notIn: keptUuids.length > 0 ? keptUuids : [''] } },
      });

      for (const item of checklist) {
        await tx.demandChecklistItem.upsert({
          where: { uuid: item.uuid.toString() },
          create: {
            uuid: item.uuid.toString(),
            demandId: updated.id,
            title: item.title,
            done: item.done,
            position: item.position,
          },
          update: { title: item.title, done: item.done, position: item.position },
        });
      }

      return tx.demand.findUniqueOrThrow({
        where: { id: updated.id },
        include: DEMAND_INCLUDE,
      });
    });

    return DemandMapper.toDomain(row);
  }

  async delete(uuid: Uuid): Promise<void> {
    // Attachment rows cascade; their stored bytes are removed by the use case, which
    // owns the FileStoragePort.
    await this.prisma.demand.delete({ where: { uuid: uuid.toString() } });
  }

  // --- DemandQueries (read model) ---

  async listCards(filter: DemandListFilter): Promise<DemandCardView[]> {
    const rows = await this.prisma.demand.findMany({
      where: whereFromFilter(filter),
      include: DEMAND_INCLUDE,
      // The board's contract: nearest deadline first. `uuid` breaks ties so that
      // pagination and re-fetches stay stable.
      orderBy: [{ dueDate: 'asc' }, { uuid: 'asc' }],
    });
    return rows.map(toCardView);
  }

  async findCard(uuid: Uuid): Promise<DemandCardView | null> {
    const row = await this.prisma.demand.findUnique({
      where: { uuid: uuid.toString() },
      include: DEMAND_INCLUDE,
    });
    return row ? toCardView(row) : null;
  }

  async listCardsPage(
    filter: DemandListFilter,
    page: { page: number; limit: number; sort?: DemandSort },
  ): Promise<DemandPage> {
    const where = whereFromFilter(filter);
    const [rows, total] = await Promise.all([
      this.prisma.demand.findMany({
        where,
        include: DEMAND_INCLUDE,
        orderBy: orderByFromSort(page.sort),
        skip: (page.page - 1) * page.limit,
        take: page.limit,
      }),
      this.prisma.demand.count({ where }),
    ]);

    return { items: rows.map(toCardView), total };
  }

  async responsiblesSeen(
    restrictToProjectUuids: readonly string[] | null,
  ): Promise<{ uuid: string; name: string }[]> {
    const groups = await this.prisma.demand.groupBy({
      by: ['responsibleUserId'],
      where:
        restrictToProjectUuids != null
          ? {
              OR: [
                { projectId: null },
                { project: { uuid: { in: [...restrictToProjectUuids] } } },
              ],
            }
          : {},
    });
    if (groups.length === 0) {
      return [];
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: groups.map((g) => g.responsibleUserId) } },
      select: { uuid: true, name: true },
    });
    return users.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  private async resolveRefs(
    projectUuid: Uuid | null,
    responsibleUuid: Uuid,
    createdByUuid: Uuid,
  ): Promise<{ projectId: bigint | null; responsibleId: bigint; createdById: bigint }> {
    const [project, users] = await Promise.all([
      projectUuid
        ? this.prisma.project.findUnique({
            where: { uuid: projectUuid.toString() },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.prisma.user.findMany({
        where: { uuid: { in: [responsibleUuid.toString(), createdByUuid.toString()] } },
        select: { id: true, uuid: true },
      }),
    ]);

    if (projectUuid && !project) {
      throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    }
    const responsible = users.find((u) => u.uuid === responsibleUuid.toString());
    const createdBy = users.find((u) => u.uuid === createdByUuid.toString());
    if (!responsible || !createdBy) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }
    return {
      projectId: project?.id ?? null,
      responsibleId: responsible.id,
      createdById: createdBy.id,
    };
  }
}

function toCardView(row: DemandRow): DemandCardView {
  const firstImage = row.attachments.find((a) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(a.mimeType),
  );
  return {
    uuid: row.uuid,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: CalendarDate.fromDate(row.dueDate).toISO(),
    project: row.project ? { uuid: row.project.uuid, name: row.project.name } : null,
    responsible: {
      uuid: row.responsible.uuid,
      name: row.responsible.name,
      avatarUrl: row.responsible.avatarUrl,
      active: row.responsible.active,
      deletedAt: row.responsible.deletedAt,
    },
    createdBy: { uuid: row.createdBy.uuid, name: row.createdBy.name },
    attachmentCount: row.attachments.length,
    previewThumbnailKey: firstImage?.thumbnailKey ?? firstImage?.storageKey ?? null,
    checklist: row.checklist.map((item) => ({
      uuid: item.uuid,
      title: item.title,
      done: item.done,
      position: item.position,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archived: row.archived,
  };
}

export class PrismaAttachmentRepository implements AttachmentRepository {
  constructor(private readonly database: PrismaDatabase) {}

  /** The open unit of work's transaction when there is one; the root client otherwise. */
  private get prisma() {
    return this.database.client;
  }

  async add(demandUuid: Uuid, attachment: DemandAttachment): Promise<void> {
    const [demand, user] = await Promise.all([
      this.prisma.demand.findUnique({
        where: { uuid: demandUuid.toString() },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { uuid: attachment.createdByUserUuid.toString() },
        select: { id: true },
      }),
    ]);
    if (!demand) {
      throw DomainError.notFound('DEMAND_NOT_FOUND', 'Demanda não encontrada.');
    }
    if (!user) {
      throw DomainError.notFound('USER_NOT_FOUND', 'Usuário não encontrado.');
    }

    await this.prisma.demandAttachment.create({
      data: {
        uuid: attachment.uuid.toString(),
        demandId: demand.id,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        storageKey: attachment.storageKey,
        thumbnailKey: attachment.thumbnailKey,
        createdByUserId: user.id,
      },
    });
  }

  async remove(attachmentUuid: Uuid): Promise<void> {
    await this.prisma.demandAttachment.deleteMany({ where: { uuid: attachmentUuid.toString() } });
  }

  async findStorageKeysOfDemand(
    demandUuid: Uuid,
  ): Promise<{ storageKey: string; thumbnailKey: string | null }[]> {
    return this.prisma.demandAttachment.findMany({
      where: { demand: { uuid: demandUuid.toString() } },
      select: { storageKey: true, thumbnailKey: true },
    });
  }
}

/**
 * Resolves who may be the responsible of a demand.
 *
 * The three conditions — active, allocated to the project, role granting
 * DEMAND_BE_ASSIGNEE — are applied in SQL for the dropdown, and re-checked through the
 * domain specification on write. The query is capability-driven, so a custom role that
 * is granted DEMAND_BE_ASSIGNEE appears here without any code change.
 *
 * A `null` project drops the allocation condition and keeps the other two: a demand
 * attached to nothing is bounded by capability alone, so anyone who may hold a demand
 * may hold that one.
 */
export class PrismaAssigneeDirectory implements AssigneeDirectory {
  constructor(private readonly database: PrismaDatabase) {}

  /** The open unit of work's transaction when there is one; the root client otherwise. */
  private get prisma() {
    return this.database.client;
  }

  async findCandidate(projectUuid: Uuid | null, userUuid: Uuid): Promise<AssigneeCandidate | null> {
    const user = await this.prisma.user.findUnique({
      where: { uuid: userUuid.toString() },
      select: {
        uuid: true,
        name: true,
        active: true,
        role: {
          select: {
            active: true,
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
        memberships: {
          // An impossible filter when there is no project: the flag below is what makes
          // the empty result irrelevant, rather than this query pretending otherwise.
          where: { project: { uuid: projectUuid ? projectUuid.toString() : '' } },
          select: { projectId: true },
        },
      },
    });

    if (!user) {
      return null;
    }

    const codes = user.role.active ? user.role.permissions.map((p) => p.permission.code) : [];
    return {
      userUuid: Uuid.create(user.uuid),
      name: user.name,
      active: user.active,
      requiresMembership: projectUuid !== null,
      isProjectMember: user.memberships.length > 0,
      // DEMAND_BE_ASSIGNEE is a child of DEMAND_ACCESS, so the parent must be present
      // for it to have any effect — the same ACCESS-sovereignty rule as everywhere else.
      canBeAssignee: codes.includes('DEMAND_BE_ASSIGNEE') && codes.includes('DEMAND_ACCESS'),
    };
  }

  async listEligible(
    projectUuid: Uuid | null,
    search?: string,
  ): Promise<{ uuid: string; name: string; avatarUrl: string | null }[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        active: true,
        ...(search?.trim() ? { name: { contains: search.trim() } } : {}),
        ...(projectUuid
          ? { memberships: { some: { project: { uuid: projectUuid.toString() } } } }
          : {}),
        role: {
          active: true,
          AND: [
            { permissions: { some: { permission: { code: 'DEMAND_BE_ASSIGNEE' } } } },
            { permissions: { some: { permission: { code: 'DEMAND_ACCESS' } } } },
          ],
        },
      },
      select: { uuid: true, name: true, avatarUrl: true },
      orderBy: { name: 'asc' },
    });
    return rows;
  }
}
