import { type Prisma } from '@prisma/client';
import { type PrismaDatabase } from '../../../shared/infrastructure/prisma-database';
import { type DemandFlowQueries } from '../../dashboard/application/get-dashboard';
import { type StatusTransition } from '../../dashboard/domain/dashboard-metrics';

/** Rows per IN list — keeps each statement well inside MySQL's packet and plan limits. */
const CHUNK = 500;

/**
 * Every activity that can carry a status change.
 *
 * `demand.status_changed` is the Kanban move and the integration's status endpoint.
 * `demand.updated` is an edit that changed status together with — or instead of — other
 * fields (the edit form saves everything in one request). `demand.created` carries the
 * starting column when a demand is created directly in one. Reading only the first of
 * these left deliveries made through the edit form without a delivery date, and demands
 * created already in progress without a start.
 */
const STATUS_ACTIONS = ['demand.status_changed', 'demand.updated', 'demand.created'];

/**
 * Status transitions of a set of demands, read from the `logs` table.
 *
 * Lives in the logs module because that module owns the table and its SQL; the
 * Dashboard only declares the question it needs answered. The query walks
 * `ix_logs_subject_time (subject_type, subject_uuid, occurred_at, uuid)` — the same index
 * that serves a demand's "Atualizações" tab.
 */
export class PrismaDemandFlowQueries implements DemandFlowQueries {
  constructor(private readonly database: PrismaDatabase) {}

  async statusTransitions(demandUuids: readonly string[]): Promise<StatusTransition[]> {
    const transitions: StatusTransition[] = [];
    for (let index = 0; index < demandUuids.length; index += CHUNK) {
      const rows = await this.database.client.log.findMany({
        where: {
          category: 'ACTIVITY',
          action: { in: STATUS_ACTIONS },
          subjectType: 'DEMAND',
          subjectUuid: { in: demandUuids.slice(index, index + CHUNK) },
        },
        select: { subjectUuid: true, occurredAt: true, action: true, changes: true, metadata: true },
        orderBy: [{ occurredAt: 'asc' }, { uuid: 'asc' }],
      });
      for (const row of rows) {
        const change =
          row.action === 'demand.created' ? initialStatusOf(row.metadata) : statusChangeOf(row.changes);
        if (row.subjectUuid && change) {
          transitions.push({
            demandUuid: row.subjectUuid,
            from: change.from,
            to: change.to,
            occurredAt: row.occurredAt,
          });
        }
      }
    }
    return transitions;
  }
}

export function statusChangeOf(changes: Prisma.JsonValue): { from: string | null; to: string } | null {
  if (!Array.isArray(changes)) return null;
  for (const change of changes) {
    if (change && typeof change === 'object' && !Array.isArray(change)) {
      const record = change as Record<string, unknown>;
      if (record.field === 'status' && typeof record.to === 'string') {
        return { from: typeof record.from === 'string' ? record.from : null, to: record.to };
      }
    }
  }
  return null;
}

/**
 * A demand created straight into a column other than NOT_STARTED entered that column at
 * creation. One created in NOT_STARTED did not transition anywhere, so it yields nothing.
 */
export function initialStatusOf(metadata: Prisma.JsonValue): { from: null; to: string } | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const status = (metadata as Record<string, unknown>).status;
  return typeof status === 'string' && status !== 'NOT_STARTED' ? { from: null, to: status } : null;
}
