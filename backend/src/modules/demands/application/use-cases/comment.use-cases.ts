import { type Actor } from '../../../../shared/application/actor';
import { type UnitOfWork } from '../../../../shared/application/unit-of-work.port';
import { DomainError } from '../../../../shared/domain/errors';
import { Uuid } from '../../../../shared/domain/identifier';
import {
  type LogPageDTO,
  type LogQueries,
  clampPageNumber,
  clampPageSize,
  toLogPageDTO,
} from '../../../logs/application/ports';
import { DemandComment } from '../../domain/demand-comment';
import { type DemandActivityLog } from '../demand-activity';
import { type CommentRepository, type DemandCommentView } from '../ports/repositories';
import { type DemandAccessGuard } from './demand.use-cases';

export interface DemandCommentDTO {
  uuid: string;
  body: string;
  author: { uuid: string; name: string };
  createdAt: string;
  editedAt: string | null;
  /** Convenience for the UI. The domain enforces authorship on every write regardless. */
  canEdit: boolean;
}

/**
 * Archived is read-only, and a conversation about a demand is part of managing it — the
 * same rule `Demand.assertNotArchived` enforces on the aggregate's own fields, asserted
 * here because a comment is its own aggregate and never reaches those mutators.
 */
function assertNotArchived(demand: { archived: boolean }): void {
  if (demand.archived) {
    throw DomainError.forbidden(
      'DEMAND_ARCHIVED_READONLY',
      'Demandas arquivadas não podem ser alteradas. Desarquive para gerenciar.',
    );
  }
}

function toDTO(actor: Actor, view: DemandCommentView): DemandCommentDTO {
  return {
    uuid: view.uuid,
    body: view.body,
    author: view.author,
    createdAt: view.createdAt.toISOString(),
    editedAt: view.editedAt ? view.editedAt.toISOString() : null,
    canEdit: actor.can('DEMAND_COMMENT') && view.author.uuid === actor.userUuid.toString(),
  };
}

/** Reading a thread is part of reading the demand: DEMAND_ACCESS and project access. */
export class ListDemandComments {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly comments: CommentRepository,
  ) {}

  async execute(actor: Actor, demandUuid: string): Promise<DemandCommentDTO[]> {
    const demand = await this.guard.loadAccessible(actor, demandUuid);
    const views = await this.comments.listByDemand(demand.uuid);
    return views.map((view) => toDTO(actor, view));
  }
}

export class AddDemandComment {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly comments: CommentRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
  ) {}

  async execute(actor: Actor, demandUuid: string, body: string): Promise<DemandCommentDTO> {
    actor.require('DEMAND_COMMENT');
    const demand = await this.guard.loadAccessible(actor, demandUuid);
    assertNotArchived(demand);
    const comment = DemandComment.create({
      demandUuid: demand.uuid,
      authorUuid: actor.userUuid,
      body,
    });

    const view = await this.uow.run(async () => {
      await this.comments.create(comment);
      await this.activity.record(actor, 'demand.comment_added', await this.activity.snapshot(demand.uuid), {
        metadata: { comment: { uuid: comment.uuid.toString(), excerpt: comment.excerpt() } },
      });
      return this.comments.findView(comment.uuid);
    });

    if (!view) {
      throw DomainError.invariant('COMMENT_NOT_PERSISTED', 'Falha ao carregar o comentário criado.');
    }
    return toDTO(actor, view);
  }
}

export class EditDemandComment {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly comments: CommentRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
  ) {}

  async execute(
    actor: Actor,
    demandUuid: string,
    commentUuid: string,
    body: string,
  ): Promise<DemandCommentDTO> {
    actor.require('DEMAND_COMMENT');
    const demand = await this.guard.loadAccessible(actor, demandUuid);
    assertNotArchived(demand);
    const comment = await loadCommentOf(this.comments, demand.uuid, commentUuid);

    const changed = comment.edit(actor.userUuid, body);

    const view = await this.uow.run(async () => {
      if (changed) {
        await this.comments.update(comment);
        await this.activity.record(actor, 'demand.comment_edited', await this.activity.snapshot(demand.uuid), {
          metadata: { comment: { uuid: comment.uuid.toString(), excerpt: comment.excerpt() } },
        });
      }
      return this.comments.findView(comment.uuid);
    });

    if (!view) {
      throw DomainError.notFound('COMMENT_NOT_FOUND', 'Comentário não encontrado.');
    }
    return toDTO(actor, view);
  }
}

export class DeleteDemandComment {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly comments: CommentRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
  ) {}

  async execute(actor: Actor, demandUuid: string, commentUuid: string): Promise<void> {
    actor.require('DEMAND_COMMENT');
    const demand = await this.guard.loadAccessible(actor, demandUuid);
    assertNotArchived(demand);
    const comment = await loadCommentOf(this.comments, demand.uuid, commentUuid);
    comment.assertCanDelete(actor.userUuid);

    await this.uow.run(async () => {
      // The excerpt is kept in the entry: once the row is gone, the log is the only trace
      // that something was said and removed.
      await this.activity.record(actor, 'demand.comment_deleted', await this.activity.snapshot(demand.uuid), {
        metadata: { comment: { uuid: comment.uuid.toString(), excerpt: comment.excerpt() } },
      });
      await this.comments.delete(comment.uuid);
    });
  }
}

/**
 * A demand's "Atualizações" tab.
 *
 * Governed by access to the demand, not by LOG_ACCESS: the history of a card is part of
 * the card, and anyone who may open it may read how it got here. Technical events about
 * the demand — a refused move, a denied edit — are added only for actors who may see
 * system logs anyway, so the tab never becomes a side door into them.
 */
export class GetDemandHistory {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly logs: LogQueries,
  ) {}

  async execute(
    actor: Actor,
    demandUuid: string,
    page: { page?: number; limit?: number } = {},
  ): Promise<LogPageDTO> {
    const demand = await this.guard.loadAccessible(actor, demandUuid);

    const pageSize = clampPageSize(page.limit);
    const pageNumber = clampPageNumber(page.page);
    const result = await this.logs.search(
      { projectUuids: null, organization: false, system: actor.can('LOG_VIEW_SYSTEM') },
      {
        subjectType: 'DEMAND',
        subjectUuid: demand.uuid.toString(),
      },
      { page: pageNumber, limit: pageSize },
    );
    return toLogPageDTO(result, pageNumber, pageSize);
  }
}

async function loadCommentOf(
  comments: CommentRepository,
  demandUuid: Uuid,
  commentUuid: string,
): Promise<DemandComment> {
  if (!Uuid.isValid(commentUuid)) {
    throw DomainError.notFound('COMMENT_NOT_FOUND', 'Comentário não encontrado.');
  }
  const comment = await comments.findByUuid(Uuid.create(commentUuid));
  // A comment reached through the wrong demand is reported as absent: the demand in the
  // URL is what the access check was run against.
  if (!comment || !comment.demandUuid.equals(demandUuid)) {
    throw DomainError.notFound('COMMENT_NOT_FOUND', 'Comentário não encontrado.');
  }
  return comment;
}
