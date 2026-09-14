import { type Actor } from '../../../../shared/application/actor';
import {
  type FieldChange,
  type LogActor,
  type SystemLogger,
} from '../../../../shared/application/activity-log.port';
import { type FileStoragePort } from '../../../../shared/application/file-storage.port';
import { type HtmlSanitizer } from '../../../../shared/application/html-sanitizer.port';
import { type UnitOfWork } from '../../../../shared/application/unit-of-work.port';
import { CalendarDate } from '../../../../shared/domain/calendar-date';
import { DomainError } from '../../../../shared/domain/errors';
import { Uuid } from '../../../../shared/domain/identifier';
import { type ProjectAccessResolver } from '../../../projects/application/use-cases/project.use-cases';
import { clampDemandPageNumber, clampDemandPageSize } from '../demand-page';
import { AssigneeEligibility } from '../../domain/assignee-eligibility';
import { ChecklistItem } from '../../domain/checklist-item';
import { Demand } from '../../domain/demand';
import { RichText } from '../../domain/rich-text';
import { type DemandStatusValue } from '../../domain/demand-status';
import { type DemandActivityLog } from '../demand-activity';
import {
  type AssigneeDirectory,
  type AttachmentRepository,
  type DemandCardView,
  type DemandQueries,
  type DemandRepository,
  type DemandSort,
} from '../ports/repositories';
import { removeStoredFiles } from '../storage-cleanup';

export interface DemandAttachmentDTO {
  uuid: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  url: string;
  thumbnailUrl: string | null;
}

export interface DemandDTO extends Omit<DemandCardView, 'previewThumbnailKey'> {
  previewThumbnailUrl: string | null;
  attachments?: DemandAttachmentDTO[];
  /** Convenience for the UI; the backend remains the authority on transitions. */
  isTerminal: boolean;
}

/**
 * Shared guard for every demand-scoped operation.
 *
 * Reaching a demand requires three independent things: the DEMAND_ACCESS capability
 * (what the actor may do), access to the demand's project (where they may do it) and —
 * without DEMAND_VIEW_ALL — a stake in the demand itself (whose work it is).
 * Centralising it here is what stops a future endpoint from accidentally skipping any
 * of them.
 */
export class DemandAccessGuard {
  constructor(
    private readonly demands: DemandRepository,
    private readonly projectAccess: ProjectAccessResolver,
  ) {}

  async loadAccessible(actor: Actor, demandUuid: string): Promise<Demand> {
    actor.require('DEMAND_ACCESS');
    const uuid = parseUuid(demandUuid);
    const demand = await this.demands.findByUuid(uuid);
    if (!demand) {
      throw DomainError.notFound('DEMAND_NOT_FOUND', 'Demanda não encontrada.');
    }
    const policy = await this.projectAccess.forActor(actor);
    // Reports "project not found" rather than "forbidden" — see ProjectAccessPolicy.
    // A demand with no project has no allocation boundary, so this passes by design and
    // the ownership rule below is the only thing bounding it.
    policy.assertAccess(actor, demand.projectUuid);

    /*
     * Without DEMAND_VIEW_ALL an actor reads their own work, not the team's. Reported as
     * "not found" for the same reason a project outside the actor's allocations is:
     * confirming that a demand exists is itself the leak.
     */
    if (!actor.canViewAllDemands() && !isOwnDemand(actor, demand)) {
      throw DomainError.notFound('DEMAND_NOT_FOUND', 'Demanda não encontrada.');
    }
    return demand;
  }

  /**
   * The write-side counterpart of `loadAccessible`, used by every use case that
   * actually changes a demand (or something that hangs off it — a checklist item, an
   * attachment) rather than merely reading one.
   *
   * DEMAND_VIEW_ALL is deliberately not enough here. It widens what a shared board
   * shows, not who may act on someone else's work — a Desenvolvedor reading the whole
   * team's Kanban for context has not thereby been trusted to rename or move cards
   * that were never assigned to them. That trust is DEMAND_MANAGE_ALL, granted on its
   * own (see the Agilista's seeded profile, which holds both).
   *
   * Reported as 403, not 404: unlike `loadAccessible`'s visibility check, the actor
   * has already legitimately seen this demand by the time this runs — what is refused
   * is the write, not the demand's existence.
   */
  async loadManageable(actor: Actor, demandUuid: string): Promise<Demand> {
    const demand = await this.loadAccessible(actor, demandUuid);
    if (!actor.canManageAllDemands() && !isOwnDemand(actor, demand)) {
      throw DomainError.forbidden(
        'DEMAND_NOT_OWN',
        'Você só pode gerenciar demandas das quais é responsável ou que você criou.',
      );
    }
    return demand;
  }
}

/** Responsible or author — the two ways a demand is someone's own. */
function isOwnDemand(actor: Actor, demand: Demand): boolean {
  return (
    demand.responsibleUserUuid.equals(actor.userUuid) ||
    demand.createdByUserUuid.equals(actor.userUuid)
  );
}

/**
 * `undefined` for an actor who reads everything; their own uuid otherwise — the single
 * place the DEMAND_VIEW_ALL rule turns into a query filter.
 */
function ownerRestrictionOf(actor: Actor): string | undefined {
  return actor.canViewAllDemands() ? undefined : actor.userUuid.toString();
}

function toDemandDTO(card: DemandCardView, storage: FileStoragePort): DemandDTO {
  const { previewThumbnailKey, ...rest } = card;
  return {
    ...rest,
    previewThumbnailUrl: previewThumbnailKey ? storage.resolveUrl(previewThumbnailKey) : null,
    isTerminal: card.status === 'PRODUCTION',
  };
}

export class ListDemands {
  constructor(
    private readonly queries: DemandQueries,
    private readonly projectAccess: ProjectAccessResolver,
    private readonly storage: FileStoragePort,
  ) {}

  async execute(
    actor: Actor,
    filter: {
      projectUuid?: string;
      search?: string;
      status?: string;
      /** `true` reads only archived demands; omitted (the board's default) reads only active ones. */
      archived?: boolean;
    } = {},
  ): Promise<DemandDTO[]> {
    actor.require('DEMAND_ACCESS');
    const policy = await this.projectAccess.forActor(actor);

    if (filter.projectUuid) {
      policy.assertAccess(actor, parseUuid(filter.projectUuid));
    }

    const cards = await this.queries.listCards({
      restrictToProjectUuids: policy.visibleProjectUuids(actor),
      restrictToOwnerUuid: ownerRestrictionOf(actor),
      projectUuid: filter.projectUuid ? parseUuid(filter.projectUuid) : undefined,
      search: filter.search,
      status: filter.status ? Demand.assertStatus(filter.status) : undefined,
      archived: filter.archived ?? false,
    });

    return cards.map((card) => toDemandDTO(card, this.storage));
  }
}

export interface DemandPageDTO {
  items: DemandDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * The Demandas screen: every demand that ever passed through the system, treated as a
 * history, paged by number rather than accumulated. `ListDemands` stays the board's own
 * query, unbounded on purpose; this is the other reading of the same rows, with a total
 * the UI can show — and jump across — before anyone has paged through anything.
 */
export class ListDemandsPage {
  constructor(
    private readonly queries: DemandQueries,
    private readonly projectAccess: ProjectAccessResolver,
    private readonly storage: FileStoragePort,
  ) {}

  async execute(
    actor: Actor,
    input: {
      projectUuid?: string;
      search?: string;
      status?: string;
      priority?: string;
      responsibleUuid?: string;
      sort?: DemandSort;
      page?: number;
      limit?: number;
      archived?: boolean;
      /**
       * `true` drops the archived filter entirely instead of narrowing to one state —
       * the user profile screen's "every demand tied to this person" reading, where an
       * archived one still belongs in the list, just marked as such. Wins over `archived`
       * when both are somehow sent, since "every state" is the wider request.
       */
      includeArchived?: boolean;
    },
  ): Promise<DemandPageDTO> {
    actor.require('DEMAND_ACCESS');
    const policy = await this.projectAccess.forActor(actor);

    if (input.projectUuid) {
      policy.assertAccess(actor, parseUuid(input.projectUuid));
    }

    const pageSize = clampDemandPageSize(input.limit);
    const pageNumber = clampDemandPageNumber(input.page);

    const page = await this.queries.listCardsPage(
      {
        restrictToProjectUuids: policy.visibleProjectUuids(actor),
        restrictToOwnerUuid: ownerRestrictionOf(actor),
        projectUuid: input.projectUuid ? parseUuid(input.projectUuid) : undefined,
        search: input.search,
        status: input.status ? Demand.assertStatus(input.status) : undefined,
        priority: input.priority ? Demand.assertPriority(input.priority) : undefined,
        responsibleUuid: input.responsibleUuid
          ? parseUuid(input.responsibleUuid, 'RESPONSIBLE_NOT_FOUND', 'Responsável não encontrado.')
          : undefined,
        archived: input.includeArchived ? undefined : input.archived ?? false,
      },
      { page: pageNumber, limit: pageSize, sort: input.sort },
    );

    return {
      items: page.items.map((card) => toDemandDTO(card, this.storage)),
      page: pageNumber,
      pageSize,
      total: page.total,
      totalPages: Math.max(1, Math.ceil(page.total / pageSize)),
    };
  }
}

export interface DemandFiltersDTO {
  responsibles: { uuid: string; name: string }[];
}

/**
 * Option lists for the Demandas screen's filter bar, the same idea as `GetLogFilters`:
 * status and priority are closed, compile-time catalogs the frontend already owns, so
 * the only list that genuinely needs a query is "who has ever been responsible for a
 * demand this actor can see" — a fact only the database has.
 */
export class GetDemandFilters {
  constructor(
    private readonly queries: DemandQueries,
    private readonly projectAccess: ProjectAccessResolver,
  ) {}

  async execute(actor: Actor): Promise<DemandFiltersDTO> {
    actor.require('DEMAND_ACCESS');
    const policy = await this.projectAccess.forActor(actor);
    const responsibles = await this.queries.responsiblesSeen(policy.visibleProjectUuids(actor));
    return { responsibles };
  }
}

export class GetDemand {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly queries: DemandQueries,
    private readonly storage: FileStoragePort,
  ) {}

  async execute(actor: Actor, demandUuid: string): Promise<DemandDTO> {
    const demand = await this.guard.loadAccessible(actor, demandUuid);
    const card = await this.queries.findCard(demand.uuid);
    if (!card) {
      throw DomainError.notFound('DEMAND_NOT_FOUND', 'Demanda não encontrada.');
    }
    const { previewThumbnailKey, ...rest } = card;

    return {
      ...rest,
      previewThumbnailUrl: previewThumbnailKey ? this.storage.resolveUrl(previewThumbnailKey) : null,
      isTerminal: demand.isTerminal,
      attachments: demand.attachments.map((attachment) => ({
        uuid: attachment.uuid.toString(),
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        isImage: attachment.isImage(),
        url: this.storage.resolveUrl(attachment.storageKey),
        thumbnailUrl: attachment.thumbnailKey
          ? this.storage.resolveUrl(attachment.thumbnailKey)
          : null,
      })),
    };
  }
}

export interface CreateDemandInput {
  /**
   * Optional. Omitted, the demand belongs to no project and any user who may hold a
   * demand at all may be its responsible — there is no allocation to check against.
   */
  projectUuid?: string | null;
  title: string;
  description: string;
  dueDate: string;
  responsibleUuid: string;
  /** Item titles, in display order. Optional — a demand needs no checklist. */
  checklist?: string[];
  /**
   * Where on the board the demand starts. Defaults to `NOT_STARTED` — the ordinary
   * creation form never sends this field at all. It exists for the Kanban's per-column
   * "+", which is itself only offered to actors holding `DEMAND_CREATE_WITH_STATUS`:
   * sending it at all, for any value, requires that permission — see `CreateDemand`.
   */
  status?: string;
  /** Unlike `status`, carries no permission of its own. Omitted, it defaults to MEDIUM. */
  priority?: string;
}

export class CreateDemand {
  constructor(
    private readonly demands: DemandRepository,
    private readonly assignees: AssigneeDirectory,
    private readonly projectAccess: ProjectAccessResolver,
    private readonly sanitizer: HtmlSanitizer,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
  ) {}

  async execute(actor: Actor, input: CreateDemandInput): Promise<{ uuid: string }> {
    actor.requireAll(['DEMAND_ACCESS', 'DEMAND_CREATE']);

    const status = input.status ? Demand.assertStatus(input.status) : undefined;
    if (status !== undefined) {
      // A whole capability of its own — separate from DEMAND_UPDATE — because it governs
      // a create-time decision, not the power to change a demand that already exists.
      // Without it, the field is simply refused: the actor gets exactly the plain,
      // always-NOT_STARTED creation the form has always offered.
      actor.require('DEMAND_CREATE_WITH_STATUS');
      if (status === 'PRODUCTION') {
        throw DomainError.forbidden(
          'DEMAND_CANNOT_CREATE_IN_PRODUCTION',
          'Uma demanda não pode nascer em produção — mova-a para lá depois de criada.',
        );
      }
    }

    const projectUuid = input.projectUuid
      ? parseUuid(input.projectUuid, 'PROJECT_NOT_FOUND', 'Projeto não encontrado.')
      : null;
    const policy = await this.projectAccess.forActor(actor);
    policy.assertAccess(actor, projectUuid);

    // Eligibility is checked against the *target* project, and the facts come from the
    // directory while the rule itself stays in the domain specification.
    const candidate = await this.assignees.findCandidate(
      projectUuid,
      parseUuid(input.responsibleUuid, 'RESPONSIBLE_NOT_FOUND', 'Responsável não encontrado.'),
    );
    AssigneeEligibility.assert(candidate);

    const demand = Demand.create({
      projectUuid,
      title: input.title,
      // Sanitize first, validate second: the length rule must measure what will
      // actually be stored, not what the client hoped to store.
      description: RichText.fromSanitizedHtml(this.sanitizer.sanitize(input.description)),
      dueDate: CalendarDate.fromISO(input.dueDate),
      responsibleUserUuid: candidate!.userUuid,
      createdByUserUuid: actor.userUuid,
      status,
      priority: input.priority ? Demand.assertPriority(input.priority) : undefined,
    });

    /*
     * The checklist is created with the demand, not after it.
     *
     * Two reasons, and neither is convenience. It is one act of authoring, so it is
     * governed by DEMAND_CREATE — requiring DEMAND_UPDATE to include a checklist in a
     * brand-new demand would mean an Administrador, who may create demands but not edit
     * them, silently loses the list they just typed. And it is one aggregate, so it is
     * one write: a demand persisted with half of its checklist is a state the invariants
     * say cannot exist.
     */
    for (const title of input.checklist ?? []) {
      demand.addChecklistItem(
        ChecklistItem.create({ title, position: demand.nextChecklistPosition() }),
      );
    }

    const persisted = await this.uow.run(async () => {
      const created = await this.demands.create(demand);
      const card = await this.activity.snapshot(created.uuid);
      // One entry for the act of creation; the checklist written with it is part of that
      // act, so it is counted here rather than emitted as N separate additions.
      await this.activity.record(actor, 'demand.created', card, {
        metadata: {
          status: card.status,
          priority: card.priority,
          responsible: card.responsible.name,
          dueDate: card.dueDate,
          checklistItems: card.checklist.length,
        },
      });
      return created;
    });
    return { uuid: persisted.uuid.toString() };
  }
}

export class UpdateDemand {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly demands: DemandRepository,
    private readonly assignees: AssigneeDirectory,
    private readonly projectAccess: ProjectAccessResolver,
    private readonly sanitizer: HtmlSanitizer,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
  ) {}

  async execute(
    actor: Actor,
    demandUuid: string,
    input: {
      title?: string;
      description?: string;
      dueDate?: string;
      responsibleUuid?: string;
      /** `null` detaches the demand from its project; `undefined` leaves it untouched. */
      projectUuid?: string | null;
      priority?: string;
      /**
       * Optional so the drag-and-drop endpoint (`MoveDemand`) stays the primary path for a
       * status change on its own. Accepted here too so an edit that also touches other
       * fields records as the one event it actually was — a title rename and a status
       * change made in the same save are one act, not two, and a reader (or a recipient's
       * inbox) should see them that way.
       */
      status?: string;
    },
  ): Promise<{ uuid: string }> {
    actor.require('DEMAND_UPDATE');
    const demand = await this.guard.loadManageable(actor, demandUuid);
    const before = await this.activity.snapshot(demand.uuid);

    /*
     * Four fields, four capabilities of their own — checked before anything mutates, the
     * same fail-fast-and-whole-or-nothing shape as the DEMAND_CREATE_WITH_STATUS check on
     * creation. DEMAND_UPDATE alone still covers title, description and status; a request
     * that only touches those needs nothing further. A project transfer that leaves the
     * existing responsible in place asks nothing of DEMAND_UPDATE_RESPONSIBLE — that
     * check is about the actor *choosing* a new responsible, not about the eligibility
     * re-validation every transfer performs regardless of who initiated it.
     */
    if (input.priority !== undefined) {
      actor.require('DEMAND_UPDATE_PRIORITY');
    }
    if (input.dueDate !== undefined) {
      actor.require('DEMAND_UPDATE_DUE_DATE');
    }
    if (input.responsibleUuid !== undefined) {
      actor.require('DEMAND_UPDATE_RESPONSIBLE');
    }
    if (input.projectUuid !== undefined) {
      actor.require('DEMAND_UPDATE_PROJECT');
    }

    /*
     * Transferring a demand between projects.
     *
     * The hazard is not the move itself but what it does to the responsible: allocation
     * is per project, so whoever is assigned may simply not be a member of the
     * destination. Rather than silently clearing the field or letting an ineligible
     * assignment survive, both decisions are validated together.
     *
     * Order matters: the project is applied first so the responsible — whether it came
     * in this request or was already on the demand — is checked against the project the
     * demand will actually live in.
     */
    if (
      input.projectUuid !== undefined &&
      (input.projectUuid ?? null) !== (demand.projectUuid?.toString() ?? null)
    ) {
      const targetProject = input.projectUuid
        ? parseUuid(input.projectUuid, 'PROJECT_NOT_FOUND', 'Projeto não encontrado.')
        : null;
      // The destination needs its own access check: reaching this demand says nothing
      // about the right to put it somewhere else. Detaching (`null`) crosses no
      // boundary, and the policy answers accordingly.
      const policy = await this.projectAccess.forActor(actor);
      policy.assertAccess(actor, targetProject);
      demand.changeProject(targetProject);
    }

    if (input.title !== undefined) {
      demand.changeTitle(input.title);
    }
    if (input.description !== undefined) {
      demand.changeDescription(
        RichText.fromSanitizedHtml(this.sanitizer.sanitize(input.description)),
      );
    }
    if (input.dueDate !== undefined) {
      demand.changeDueDate(CalendarDate.fromISO(input.dueDate));
    }
    if (input.priority !== undefined) {
      demand.changePriority(Demand.assertPriority(input.priority));
    }
    if (input.status !== undefined) {
      const targetStatus = Demand.assertStatus(input.status);
      // Same no-op-is-not-an-event rule `MoveDemand` applies: re-saving the column
      // the demand is already in changes nothing.
      if (targetStatus !== demand.status) {
        demand.moveTo(targetStatus, { override: actor.can('DEMAND_MANAGE_PRODUCTION') });
      }
    }

    // A project transfer re-opens the eligibility question even when the caller said
    // nothing about the responsible.
    if (input.responsibleUuid !== undefined || input.projectUuid !== undefined) {
      const responsibleUuid = input.responsibleUuid ?? demand.responsibleUserUuid.toString();
      const candidate = await this.assignees.findCandidate(
        demand.projectUuid,
        parseUuid(responsibleUuid, 'RESPONSIBLE_NOT_FOUND', 'Responsável não encontrado.'),
      );
      AssigneeEligibility.assert(candidate);
      demand.assignResponsible(candidate!.userUuid);
    }

    await this.uow.run(async () => {
      await this.demands.update(demand);
      const after = await this.activity.snapshot(demand.uuid);
      await recordEdits(this.activity, actor, before, after);
    });
    return { uuid: demand.uuid.toString() };
  }
}

/**
 * Turns one edit request into the entries a reader will want to filter by.
 *
 * A single PATCH can transfer a demand, reassign it and rename it at once. Those are
 * different kinds of fact — "who owned this when" is a question asked on its own — so they
 * become separate, separately filterable entries rather than one opaque "updated".
 *
 * The description's before and after are deliberately not stored: it is rich text of up
 * to tens of kilobytes, and copying it into the log on every save would turn the audit
 * trail into a second, unbounded document store. That it changed is what matters here.
 *
 * `actor` accepts a plain `LogActor` as well as a real `Actor` so the demand-integration
 * use cases — which authenticate a project credential, not a user session — can reuse
 * this exact diffing logic instead of a parallel copy of it.
 */
export async function recordEdits(
  activity: DemandActivityLog,
  actor: Actor | LogActor,
  before: DemandCardView,
  after: DemandCardView,
): Promise<void> {
  const transferred = (before.project?.uuid ?? null) !== (after.project?.uuid ?? null);
  const reassigned = before.responsible.uuid !== after.responsible.uuid;
  const responsibleChange: FieldChange = {
    field: 'responsible',
    from: before.responsible.name,
    to: after.responsible.name,
  };

  if (transferred) {
    // Scoped to the destination project: that is where the demand now lives and who will
    // work on it. The origin is kept in the entry so the move reads in both directions.
    await activity.record(actor, 'demand.transferred', after, {
      changes: [
        // `null` reads as "sem projeto" in the log renderer — the same shape every other
        // absent before/after value uses, rather than a sentinel string.
        { field: 'project', from: before.project?.name ?? null, to: after.project?.name ?? null },
        ...(reassigned ? [responsibleChange] : []),
      ],
      metadata: { fromProject: before.project },
      formerResponsibleUuid: reassigned ? before.responsible.uuid : undefined,
    });
  } else if (reassigned) {
    await activity.record(actor, 'demand.responsible_changed', after, {
      changes: [responsibleChange],
      formerResponsibleUuid: before.responsible.uuid,
    });
  }

  const edits: FieldChange[] = [];
  if (before.title !== after.title) {
    edits.push({ field: 'title', from: before.title, to: after.title });
  }
  if (before.description !== after.description) {
    edits.push({ field: 'description', from: null, to: null });
  }
  if (before.dueDate !== after.dueDate) {
    edits.push({ field: 'dueDate', from: before.dueDate, to: after.dueDate });
  }
  if (before.status !== after.status) {
    // Folded in here rather than getting its own `demand.status_changed` entry: this
    // helper runs for a general edit, and a status change made alongside other fields
    // in the same request is one act — the dedicated event is for `MoveDemand`, which
    // is genuinely the only thing that happened on a drag-and-drop move.
    edits.push({ field: 'status', from: before.status, to: after.status });
  }
  if (before.priority !== after.priority) {
    edits.push({ field: 'priority', from: before.priority, to: after.priority });
  }
  if (edits.length > 0) {
    await activity.record(actor, 'demand.updated', after, { changes: edits });
  }
}

/**
 * The Kanban drag-and-drop endpoint.
 *
 * Nothing here inspects the current status: the aggregate delegates to its state
 * object, so "PRODUCTION is terminal" is enforced without a single conditional in this
 * use case. A rejected move surfaces as a domain error and the board restores the card.
 *
 * The one thing this layer does decide is the override: DEMAND_MANAGE_PRODUCTION turns
 * into a plain boolean handed to the aggregate, which is the only input the state
 * pattern accepts from outside itself. The permission check stays here; "what override
 * means for a transition" stays entirely in demand-status.ts.
 */
export class MoveDemand {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly demands: DemandRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
  ) {}

  async execute(
    actor: Actor,
    demandUuid: string,
    targetStatus: string,
  ): Promise<{ uuid: string; status: DemandStatusValue }> {
    actor.require('DEMAND_UPDATE');
    const demand = await this.guard.loadManageable(actor, demandUuid);

    const from = demand.status;
    demand.moveTo(Demand.assertStatus(targetStatus), { override: actor.can('DEMAND_MANAGE_PRODUCTION') });

    // Dropping a card back into its own column changes nothing, and nothing is not an event.
    if (demand.status === from) {
      return { uuid: demand.uuid.toString(), status: demand.status };
    }

    await this.uow.run(async () => {
      await this.demands.update(demand);
      await this.activity.record(actor, 'demand.status_changed', await this.activity.snapshot(demand.uuid), {
        changes: [{ field: 'status', from, to: demand.status }],
      });
    });
    return { uuid: demand.uuid.toString(), status: demand.status };
  }
}

/**
 * Toggles a demand's archived flag.
 *
 * Deliberately its own small endpoint, the same shape as `MoveDemand`, rather than a
 * field folded into `UpdateDemand`. Its permission is a child of `DEMAND_UPDATE`, not of
 * `DEMAND_ACCESS` directly — the same "inert without the parent" shape `DEMAND_UPDATE_PRIORITY`
 * and the other field-level children have: archiving is a decision about a demand someone
 * is trusted to manage, so a profile with no `DEMAND_UPDATE` (able only to read, comment,
 * or delete) has no business hiding it from the board either. `DEMAND_ARCHIVE` on top of
 * that still narrows further, the way `DEMAND_MANAGE_PRODUCTION` does — holding
 * `DEMAND_UPDATE` alone does not imply it.
 */
export class ArchiveDemand {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly demands: DemandRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
  ) {}

  async execute(actor: Actor, demandUuid: string, archived: boolean): Promise<{ uuid: string; archived: boolean }> {
    actor.requireAll(['DEMAND_UPDATE', 'DEMAND_ARCHIVE']);
    const demand = await this.guard.loadManageable(actor, demandUuid);

    // Setting it to what it already is changes nothing, and nothing is not an event.
    if (demand.archived === archived) {
      return { uuid: demand.uuid.toString(), archived: demand.archived };
    }

    /*
     * Unarchiving puts a demand back on the board as someone's live responsibility.
     * Archiving one whose responsible has since been deactivated or excluded is
     * harmless — it is leaving the board either way — but bringing it back under a
     * responsible who can no longer act on it would land a card nobody can actually
     * work. The caller has to pick someone eligible first (UpdateDemand, via
     * DEMAND_UPDATE_RESPONSIBLE) and only then can this go through.
     */
    if (!archived) {
      const card = await this.activity.snapshot(demand.uuid);
      if (!card.responsible.active) {
        throw DomainError.conflict(
          'DEMAND_RESPONSIBLE_INACTIVE',
          `O responsável atual, ${card.responsible.name}, está ${
            card.responsible.deletedAt ? 'excluído' : 'inativo'
          }. Escolha um novo responsável antes de desarquivar esta demanda.`,
        );
      }
    }

    demand.setArchived(archived);

    await this.uow.run(async () => {
      await this.demands.update(demand);
      await this.activity.record(
        actor,
        archived ? 'demand.archived' : 'demand.unarchived',
        await this.activity.snapshot(demand.uuid),
      );
    });
    return { uuid: demand.uuid.toString(), archived: demand.archived };
  }
}

export class DeleteDemand {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly demands: DemandRepository,
    private readonly attachments: AttachmentRepository,
    private readonly storage: FileStoragePort,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
    private readonly systemLogger: SystemLogger,
  ) {}

  async execute(actor: Actor, demandUuid: string): Promise<void> {
    // A child of DEMAND_UPDATE, the same shape as DEMAND_ARCHIVE: deleting is a decision
    // about a demand someone is trusted to manage, so a profile with no DEMAND_UPDATE has
    // no business erasing one either.
    actor.requireAll(['DEMAND_UPDATE', 'DEMAND_DELETE']);
    const demand = await this.guard.loadManageable(actor, demandUuid);

    // Archived is read-only except for unarchiving itself — see Demand.assertNotArchived.
    // Deleting bypasses the aggregate's own mutators (there is nothing left to mutate),
    // so the rule is asserted here instead.
    if (demand.archived) {
      throw DomainError.forbidden(
        'DEMAND_ARCHIVED_READONLY',
        'Demandas arquivadas não podem ser alteradas. Desarquive para gerenciar.',
      );
    }

    const keys = await this.attachments.findStorageKeysOfDemand(demand.uuid);

    // Rows first: the database is the system of record, and an orphaned blob is a
    // storage-cleanup concern, whereas a row pointing at a deleted file is a broken
    // page for every user who opens it.
    const card = await this.uow.run(async () => {
      // Recorded before the row goes, while the snapshot can still be read. The entry has
      // no foreign key to the demand, so it outlives it — which is the point.
      const snapshot = await this.activity.snapshot(demand.uuid);
      await this.activity.record(actor, 'demand.deleted', snapshot, {
        metadata: {
          status: snapshot.status,
          responsible: snapshot.responsible.name,
          attachments: keys.length,
          checklistItems: snapshot.checklist.length,
        },
      });
      await this.demands.delete(demand.uuid);
      return snapshot;
    });

    await removeStoredFiles(
      this.storage,
      this.systemLogger,
      { actor, demand: { uuid: card.uuid, title: card.title } },
      keys.flatMap((key) => [key.storageKey, ...(key.thumbnailKey ? [key.thumbnailKey] : [])]),
    );
  }
}

/**
 * Checklist writes.
 *
 * All three go through the aggregate root and save it whole, which is what keeps the
 * item cap, the ordering and "a demand in production is frozen" in one place instead of
 * being re-stated per endpoint. They are gated by DEMAND_UPDATE: a checklist item is
 * part of a demand's scope, and editing scope is what that permission means.
 */
export class AddChecklistItem {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly demands: DemandRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
  ) {}

  async execute(actor: Actor, demandUuid: string, title: string): Promise<{ uuid: string }> {
    actor.require('DEMAND_UPDATE');
    const demand = await this.guard.loadManageable(actor, demandUuid);
    const item = ChecklistItem.create({ title, position: demand.nextChecklistPosition() });
    demand.addChecklistItem(item);

    await this.uow.run(async () => {
      await this.demands.update(demand);
      await this.activity.record(actor, 'demand.checklist_item_added', await this.activity.snapshot(demand.uuid), {
        metadata: { item: { uuid: item.uuid.toString(), title: item.title } },
      });
    });
    return { uuid: item.uuid.toString() };
  }
}

export class UpdateChecklistItem {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly demands: DemandRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
  ) {}

  async execute(
    actor: Actor,
    demandUuid: string,
    itemUuid: string,
    input: { title?: string; done?: boolean },
  ): Promise<void> {
    actor.require('DEMAND_UPDATE');
    const demand = await this.guard.loadManageable(actor, demandUuid);
    const uuid = parseUuid(itemUuid, 'CHECKLIST_ITEM_NOT_FOUND', 'Item não encontrado.');

    // Primitives, not the item: the aggregate mutates the same object in place.
    const current = demand.checklist.find((item) => item.uuid.equals(uuid));
    const before = current ? { title: current.title, done: current.done } : null;

    const item =
      input.title !== undefined
        ? demand.renameChecklistItem(uuid, input.title)
        : demand.checklist.find((candidate) => candidate.uuid.equals(uuid));
    if (input.done !== undefined) {
      demand.setChecklistItemDone(uuid, input.done);
    }
    if (!item || !before) {
      throw DomainError.notFound('CHECKLIST_ITEM_NOT_FOUND', 'Item não encontrado nesta demanda.');
    }

    const renamed = item.title !== before.title;
    const toggled = item.done !== before.done;
    if (!renamed && !toggled) {
      return;
    }

    await this.uow.run(async () => {
      await this.demands.update(demand);
      const card = await this.activity.snapshot(demand.uuid);
      const metadata = { item: { uuid: item.uuid.toString(), title: item.title } };
      if (renamed) {
        await this.activity.record(actor, 'demand.checklist_item_renamed', card, {
          changes: [{ field: 'title', from: before.title, to: item.title }],
          metadata,
        });
      }
      if (toggled) {
        await this.activity.record(
          actor,
          item.done ? 'demand.checklist_item_checked' : 'demand.checklist_item_unchecked',
          card,
          { metadata },
        );
      }
    });
  }
}

export class RemoveChecklistItem {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly demands: DemandRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
  ) {}

  async execute(actor: Actor, demandUuid: string, itemUuid: string): Promise<void> {
    actor.require('DEMAND_UPDATE');
    const demand = await this.guard.loadManageable(actor, demandUuid);
    const removed = demand.removeChecklistItem(
      parseUuid(itemUuid, 'CHECKLIST_ITEM_NOT_FOUND', 'Item não encontrado.'),
    );

    await this.uow.run(async () => {
      await this.demands.update(demand);
      await this.activity.record(actor, 'demand.checklist_item_removed', await this.activity.snapshot(demand.uuid), {
        metadata: { item: { uuid: removed.uuid.toString(), title: removed.title } },
      });
    });
  }
}

export class ListEligibleAssignees {
  constructor(
    private readonly assignees: AssigneeDirectory,
    private readonly projectAccess: ProjectAccessResolver,
  ) {}

  /**
   * `projectUuid` omitted lists everyone who may hold a demand at all — the list a
   * demand with no project has to offer, since there is no allocation to narrow it by.
   */
  async execute(
    actor: Actor,
    projectUuid: string | null,
    search?: string,
  ): Promise<{ uuid: string; name: string; avatarUrl: string | null }[]> {
    actor.require('DEMAND_ACCESS');
    const uuid = projectUuid
      ? parseUuid(projectUuid, 'PROJECT_NOT_FOUND', 'Projeto não encontrado.')
      : null;
    const policy = await this.projectAccess.forActor(actor);
    policy.assertAccess(actor, uuid);
    return this.assignees.listEligible(uuid, search);
  }
}

function parseUuid(value: string, code = 'DEMAND_NOT_FOUND', message = 'Demanda não encontrada.'): Uuid {
  if (!Uuid.isValid(value)) {
    throw DomainError.notFound(code, message);
  }
  return Uuid.create(value);
}
