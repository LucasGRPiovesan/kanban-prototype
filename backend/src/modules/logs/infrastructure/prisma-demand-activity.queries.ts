import { type PrismaDatabase } from '../../../shared/infrastructure/prisma-database';
import {
  type DemandActivityQueries,
  type RecentDemandActivity,
} from '../../assistant/application/ports';

/** Rows per IN list — the same bound the Dashboard's transition reader uses. */
const CHUNK = 500;

/**
 * Recent activity of a set of demands, for the assistant's daily summary.
 *
 * Filtered by subject — the demands the asker can see right now — rather than by project,
 * so it returns exactly what each demand's "Atualizações" tab would show under
 * DEMAND_ACCESS and nothing more: no entry about a demand since deleted, which only the
 * Logs module, under LOG_ACCESS, may show. Walks `ix_logs_subject_time`.
 */
export class PrismaDemandActivityQueries implements DemandActivityQueries {
  constructor(private readonly database: PrismaDatabase) {}

  async recentActivity(
    demandUuids: readonly string[],
    since: Date,
    limit: number,
  ): Promise<RecentDemandActivity[]> {
    const entries: RecentDemandActivity[] = [];
    for (let index = 0; index < demandUuids.length; index += CHUNK) {
      const rows = await this.database.client.log.findMany({
        where: {
          category: 'ACTIVITY',
          subjectType: 'DEMAND',
          subjectUuid: { in: demandUuids.slice(index, index + CHUNK) },
          occurredAt: { gte: since },
        },
        orderBy: [{ occurredAt: 'desc' }, { uuid: 'desc' }],
        take: limit,
        select: { occurredAt: true, action: true, summary: true, actorName: true, subjectUuid: true },
      });
      for (const row of rows) {
        entries.push({
          occurredAt: row.occurredAt,
          action: row.action,
          summary: row.summary,
          actorName: row.actorName,
          demandUuid: row.subjectUuid ?? '',
        });
      }
    }
    return entries
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit);
  }
}
