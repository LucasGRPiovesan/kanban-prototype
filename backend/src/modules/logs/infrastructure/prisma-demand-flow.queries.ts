import { type Prisma } from '@prisma/client';
import { type PrismaDatabase } from '../../../shared/infrastructure/prisma-database';
import { type DemandFlowQueries } from '../../dashboard/application/get-dashboard';
import { type StatusTransition } from '../../dashboard/domain/dashboard-metrics';

/** Rows per IN list — keeps each statement well inside MySQL's packet and plan limits. */
const CHUNK = 500;

/**
 * Status transitions of a set of demands, read from the `logs` table.
 *
 * Lives in the logs module because that module owns the table and its SQL; the
 * Dashboard only declares the question it needs answered. The query walks
 * `ix_logs_subject_time (subject_type, subject_uuid, occurred_at, uuid)` — the same index
 * that serves a demand's "Atualizações" tab — so it reads exactly the rows it returns.
 */
export class PrismaDemandFlowQueries implements DemandFlowQueries {
  constructor(private readonly database: PrismaDatabase) {}

  async statusTransitions(demandUuids: readonly string[]): Promise<StatusTransition[]> {
    const transitions: StatusTransition[] = [];
    for (let index = 0; index < demandUuids.length; index += CHUNK) {
      const rows = await this.database.client.log.findMany({
        where: {
          category: 'ACTIVITY',
          action: 'demand.status_changed',
          subjectType: 'DEMAND',
          subjectUuid: { in: demandUuids.slice(index, index + CHUNK) },
        },
        select: { subjectUuid: true, occurredAt: true, changes: true },
        orderBy: [{ occurredAt: 'asc' }, { uuid: 'asc' }],
      });
      for (const row of rows) {
        const change = statusChangeOf(row.changes);
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

function statusChangeOf(changes: Prisma.JsonValue): { from: string | null; to: string } | null {
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
