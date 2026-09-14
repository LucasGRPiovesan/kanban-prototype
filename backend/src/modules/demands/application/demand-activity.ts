import { Actor } from '../../../shared/application/actor';
import {
  type ActivityRecorder,
  type FieldChange,
  type LogActor,
  logActorOf,
} from '../../../shared/application/activity-log.port';
import { type ActivityAction } from '../../../shared/domain/activity-catalog';
import { DomainError } from '../../../shared/domain/errors';
import { type Uuid } from '../../../shared/domain/identifier';
import { type DemandChangeListener } from './ports/demand-change-listener';
import { type DemandCardView, type DemandQueries } from './ports/repositories';

/**
 * Records activity about a demand, with the labels a reader will need later.
 *
 * Every demand entry wants the same context — the demand's title and its project's name
 * as they are *right now* — and every use case would otherwise fetch it the same way.
 * Reading through DemandQueries inside the unit of work means the snapshot sees the
 * uncommitted change: "after" is the state the transaction is about to commit, not the
 * state before it started.
 *
 * The before/after diff of an edit is taken from two snapshots of the same read model, so
 * a change is described in display values (names, not uuids) without any use case having
 * to know how to turn an id into a name.
 */
export class DemandActivityLog {
  constructor(
    private readonly queries: DemandQueries,
    private readonly recorder: ActivityRecorder,
    /**
     * Told about every entry recorded here — this is the one path every demand change
     * already goes through, which is what makes it the right place to announce them.
     * Optional so tests that only care about the audit trail need not provide one.
     */
    private readonly listener: DemandChangeListener | null = null,
  ) {}

  async snapshot(demandUuid: Uuid): Promise<DemandCardView> {
    const card = await this.queries.findCard(demandUuid);
    if (!card) {
      throw DomainError.notFound('DEMAND_NOT_FOUND', 'Demanda não encontrada.');
    }
    return card;
  }

  /**
   * `actor` is a real `Actor` for every user-driven use case; the demand-integration
   * endpoints have no session and no permission set, only the credential that already
   * authorized the request, so they pass a plain `LogActor` label instead. Either way
   * the entry ends up with a name a reader recognizes — "Lucas Barbosa" or
   * "Integração — csp_key_ab12…" — never a raw credential id.
   */
  async record(
    actor: Actor | LogActor,
    action: ActivityAction,
    card: DemandCardView,
    detail: {
      changes?: FieldChange[];
      metadata?: Record<string, unknown>;
      /** Not persisted in the log — only handed to the listener. See DemandChange. */
      formerResponsibleUuid?: string;
    } = {},
  ): Promise<void> {
    const logActor = actor instanceof Actor ? logActorOf(actor) : actor;
    await this.recorder.record(logActor, {
      action,
      subject: { type: 'DEMAND', uuid: card.uuid, label: card.title },
      project: card.project,
      changes: detail.changes,
      metadata: detail.metadata,
    });
    await this.listener?.demandChanged({
      actor: logActor,
      action,
      card,
      changes: detail.changes,
      metadata: detail.metadata,
      formerResponsibleUuid: detail.formerResponsibleUuid,
    });
  }
}
