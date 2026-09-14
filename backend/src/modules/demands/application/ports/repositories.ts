import { type Uuid } from '../../../../shared/domain/identifier';
import { type AssigneeCandidate } from '../../domain/assignee-eligibility';
import { type DemandAttachment } from '../../domain/demand-attachment';
import { type Demand } from '../../domain/demand';
import { type DemandComment } from '../../domain/demand-comment';
import { type DemandPriorityValue } from '../../domain/demand-priority';
import { type DemandStatusValue } from '../../domain/demand-status';
import { type DemandPage } from '../demand-page';

export interface DemandListFilter {
  /**
   * `null` means unrestricted (PROJECT_ACCESS_ALL); otherwise a project allowlist.
   * Demands with no project at all are outside this boundary by definition and are
   * never excluded by it — `restrictToOwnerUuid` is what bounds those.
   */
  restrictToProjectUuids?: readonly string[] | null;
  /**
   * `undefined` means every demand; a uuid narrows the result to the demands that user
   * is responsible for or created — the reading someone without DEMAND_VIEW_ALL gets.
   */
  restrictToOwnerUuid?: string;
  projectUuid?: Uuid;
  search?: string;
  status?: DemandStatusValue;
  priority?: DemandPriorityValue;
  responsibleUuid?: Uuid;
  /**
   * `undefined` (the default everywhere it isn't set explicitly) excludes archived
   * demands — the board and history read as "active" unless the caller opts into seeing
   * archived ones with `true`. `false` reads only non-archived, `true` only archived.
   */
  archived?: boolean;
}

/**
 * `priority` sorts urgent-first because MySQL orders an `ENUM` column by its *declared*
 * index, not alphabetically — and `DemandPriority` is declared `LOW, MEDIUM, HIGH,
 * URGENT` in `schema.prisma` for exactly this reason, so `ORDER BY priority DESC` reads
 * as "most urgent first" with no `CASE` expression or numeric mapping required.
 */
export const DEMAND_SORTS = ['dueDate', 'createdAt', 'priority'] as const;
export type DemandSort = (typeof DEMAND_SORTS)[number];

export interface DemandRepository {
  findByUuid(uuid: Uuid): Promise<Demand | null>;
  create(demand: Demand): Promise<Demand>;
  /** Persists demand attributes; attachment rows are managed by AttachmentRepository. */
  update(demand: Demand): Promise<Demand>;
  delete(uuid: Uuid): Promise<void>;
}

export interface ChecklistItemView {
  uuid: string;
  title: string;
  done: boolean;
  position: number;
}

/** Denormalized card, shaped for the board so the UI needs no extra round trips. */
export interface DemandCardView {
  uuid: string;
  title: string;
  /** Sanitized rich-text markup. */
  description: string;
  status: DemandStatusValue;
  priority: DemandPriorityValue;
  dueDate: string;
  /** `null` for a demand that belongs to no project. */
  project: { uuid: string; name: string } | null;
  responsible: {
    uuid: string;
    name: string;
    avatarUrl: string | null;
    /** `false` when this person has been deactivated or excluded since being assigned. */
    active: boolean;
    /** Soft-delete marker of the responsible's own account — `null` unless excluded. */
    deletedAt: Date | null;
  };
  createdBy: { uuid: string; name: string };
  attachmentCount: number;
  /** Storage key of the first attached image, if any — rendered as the card preview. */
  previewThumbnailKey: string | null;
  checklist: ChecklistItemView[];
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemandQueries {
  /**
   * Board query. Backed by ix_demands_project_status_due and always ordered by
   * due date ascending, as the specification requires.
   */
  listCards(filter: DemandListFilter): Promise<DemandCardView[]>;
  findCard(uuid: Uuid): Promise<DemandCardView | null>;
  /**
   * The Demandas screen's page — same ascending due-date order as `listCards`, bounded by
   * `limit` and offset by `page`, with the matching total so the UI knows how many pages
   * exist before the person has paged through any of them. `listCards` stays unbounded on
   * purpose: the Kanban board groups the *entire* visible set into columns, and a page of
   * it would silently drop cards from columns the caller never asked to page through.
   */
  listCardsPage(
    filter: DemandListFilter,
    page: { page: number; limit: number; sort?: DemandSort },
  ): Promise<DemandPage>;
  /** Distinct responsibles among the demands a `restrictToProjectUuids` visibility allows. */
  responsiblesSeen(restrictToProjectUuids: readonly string[] | null): Promise<{ uuid: string; name: string }[]>;
}

export interface AttachmentRepository {
  add(demandUuid: Uuid, attachment: DemandAttachment): Promise<void>;
  remove(attachmentUuid: Uuid): Promise<void>;
  findStorageKeysOfDemand(demandUuid: Uuid): Promise<{ storageKey: string; thumbnailKey: string | null }[]>;
}

/**
 * Answers eligibility questions about responsibles. The criteria themselves live in
 * the domain (AssigneeEligibility); this port only supplies the facts.
 */
export interface AssigneeDirectory {
  /** `null` project: eligibility drops the membership criterion — see AssigneeEligibility. */
  findCandidate(projectUuid: Uuid | null, userUuid: Uuid): Promise<AssigneeCandidate | null>;
  listEligible(
    projectUuid: Uuid | null,
    search?: string,
  ): Promise<{ uuid: string; name: string; avatarUrl: string | null }[]>;
}

export interface DemandCommentView {
  uuid: string;
  demandUuid: string;
  /** The comment this one replies to, one level deep only. `null` for a top-level comment. */
  parentUuid: string | null;
  body: string;
  author: { uuid: string; name: string; avatarUrl: string | null };
  createdAt: Date;
  editedAt: Date | null;
}

export interface CommentRepository {
  findByUuid(uuid: Uuid): Promise<DemandComment | null>;
  findView(uuid: Uuid): Promise<DemandCommentView | null>;
  /** Newest first. */
  listByDemand(demandUuid: Uuid): Promise<DemandCommentView[]>;
  create(comment: DemandComment): Promise<void>;
  update(comment: DemandComment): Promise<void>;
  delete(uuid: Uuid): Promise<void>;
}
