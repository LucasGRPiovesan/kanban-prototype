import { type Prisma, type PrismaClient } from '@prisma/client';
import {
  type ActivityRecord,
  type ActivityRecorder,
  type FieldChange,
  type LogActor,
  type SystemEvent,
  type SystemLogger,
} from '../../../shared/application/activity-log.port';
import { logActionDefinition, scopeOf } from '../../../shared/domain/activity-catalog';
import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';
import { type PrismaDatabase } from '../../../shared/infrastructure/prisma-database';
import { requestContext } from '../../../shared/infrastructure/request-context';
import { type LogVisibility } from '../domain/log-visibility';
import { summarizeActivity } from '../application/summarize';
import {
  type LogEntryView,
  type LogPage,
  type LogQueries,
  type LogSearchFilter,
} from '../application/ports';

const LABEL_MAX = 200;
const NAME_MAX = 160;
const STACK_MAX = 4000;

/**
 * Writes business activity through the unit-of-work-aware client.
 *
 * Inside a use case's `run`, `database.client` is the open transaction, so the entry
 * commits or rolls back with the change it describes. That is the whole reason this is
 * not a fire-and-forget write.
 */
export class PrismaActivityRecorder implements ActivityRecorder {
  constructor(private readonly database: PrismaDatabase) {}

  async record(actor: LogActor | null, record: ActivityRecord): Promise<void> {
    const definition = logActionDefinition(record.action);
    if (!definition) {
      throw DomainError.invariant('UNKNOWN_LOG_ACTION', `Ação de log desconhecida: ${record.action}`);
    }
    /*
     * A project-scoped entry without its project would be invisible to exactly the
     * people it concerns. This is a programming error, so it fails loudly.
     *
     * One case is not an error: a demand may legitimately belong to no project. Such an
     * entry lands in the same place every other project-less ACTIVITY row does — the
     * organization-wide view — and the demand's own history tab reads by subject, not by
     * project, so it is never lost there either. The rule still binds every entry about
     * a project itself, where an absent project really would be a bug.
     */
    const demandWithoutProject = record.subject.type === 'DEMAND' && !record.project;
    if (scopeOf(definition) === 'PROJECT' && !record.project && !demandWithoutProject) {
      throw DomainError.invariant(
        'LOG_PROJECT_REQUIRED',
        `A ação ${record.action} precisa do projeto a que se refere.`,
      );
    }

    await this.database.client.log.create({
      data: {
        uuid: Uuid.generate().toString(),
        occurredAt: new Date(),
        category: 'ACTIVITY',
        level: definition.level,
        action: record.action,
        summary: summarizeActivity(record),
        actorUuid: actor?.uuid ?? null,
        actorName: actor ? clip(actor.name, NAME_MAX) : null,
        subjectType: record.subject.type,
        subjectUuid: record.subject.uuid,
        subjectLabel: record.subject.label ? clip(record.subject.label, LABEL_MAX) : null,
        projectUuid: record.project?.uuid ?? null,
        projectName: record.project ? clip(record.project.name, NAME_MAX) : null,
        changes: record.changes?.length ? (record.changes as unknown as Prisma.InputJsonValue) : undefined,
        metadata: record.metadata ? (record.metadata as Prisma.InputJsonValue) : undefined,
        requestId: requestContext.current()?.requestId ?? null,
      },
    });
  }
}

/**
 * Writes technical events on the root client, never inside a unit of work.
 *
 * These are written precisely when something went wrong, usually after the transaction
 * of the failed work has already rolled back — joining it would erase the evidence. The
 * write is not awaited by callers and never throws: a logging failure falls back to
 * stdout as a structured line rather than masking the error being reported.
 *
 * Pending writes are tracked so shutdown (and tests) can wait for them to settle instead
 * of racing them.
 */
export class PrismaSystemLogger implements SystemLogger {
  private readonly pending = new Set<Promise<unknown>>();

  constructor(private readonly root: PrismaClient) {}

  log(event: SystemEvent): void {
    const definition = logActionDefinition(event.code);
    const write = this.root.log
      .create({
        data: {
          uuid: Uuid.generate().toString(),
          occurredAt: new Date(),
          category: 'SYSTEM',
          level: event.level ?? definition?.level ?? 'INFO',
          action: event.code,
          summary: clip(event.message, 500),
          actorUuid: event.actor?.uuid ?? null,
          actorName: event.actor ? clip(event.actor.name, NAME_MAX) : null,
          subjectType: event.subject?.type ?? null,
          subjectUuid: event.subject?.uuid ?? null,
          subjectLabel: event.subject?.label ? clip(event.subject.label, LABEL_MAX) : null,
          metadata: event.metadata ? (limitStack(event.metadata) as Prisma.InputJsonValue) : undefined,
          requestId: event.requestId ?? requestContext.current()?.requestId ?? null,
        },
      })
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error(
          JSON.stringify({
            source: 'system-logger',
            code: event.code,
            requestId: event.requestId ?? null,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      })
      .finally(() => {
        this.pending.delete(write);
      });
    this.pending.add(write);
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }
}

export class PrismaLogQueries implements LogQueries {
  constructor(private readonly database: PrismaDatabase) {}

  async search(
    visibility: LogVisibility,
    filter: LogSearchFilter,
    page: { page: number; limit: number },
  ): Promise<LogPage> {
    const where: Prisma.LogWhereInput = { AND: [visibilityWhere(visibility), filterWhere(filter)] };
    const [rows, total] = await Promise.all([
      this.database.client.log.findMany({
        where,
        // Matches the tail of every ordering index, so the database walks the index in
        // order instead of sorting the matching rows.
        orderBy: [{ occurredAt: 'desc' }, { uuid: 'desc' }],
        skip: (page.page - 1) * page.limit,
        take: page.limit,
      }),
      this.database.client.log.count({ where }),
    ]);

    return { items: rows.map(toView), total };
  }

  async actorsSeen(visibility: LogVisibility): Promise<{ uuid: string; name: string }[]> {
    const groups = await this.database.client.log.groupBy({
      by: ['actorUuid'],
      where: { AND: [visibilityWhere(visibility), { actorUuid: { not: null } }] },
      // The most recent spelling of a name is the one people will recognise.
      _max: { actorName: true },
    });
    return groups
      .filter((group) => group.actorUuid)
      .map((group) => ({ uuid: group.actorUuid!, name: group._max.actorName ?? 'Usuário' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
}

/**
 * Visibility as a WHERE clause. Each branch is a scope the actor holds; an actor holding
 * none gets a clause that matches nothing rather than no clause at all.
 */
function visibilityWhere(visibility: LogVisibility): Prisma.LogWhereInput {
  const branches: Prisma.LogWhereInput[] = [];

  if (visibility.projectUuids === null) {
    branches.push({ category: 'ACTIVITY', projectUuid: { not: null } });
  } else if (visibility.projectUuids.length > 0) {
    branches.push({ category: 'ACTIVITY', projectUuid: { in: [...visibility.projectUuids] } });
  }
  if (visibility.organization) {
    branches.push({ category: 'ACTIVITY', projectUuid: null });
  }
  if (visibility.system) {
    branches.push({ category: 'SYSTEM' });
  }

  return branches.length > 0 ? { OR: branches } : { uuid: { in: [] } };
}

function filterWhere(filter: LogSearchFilter): Prisma.LogWhereInput {
  const and: Prisma.LogWhereInput[] = [];

  if (filter.category) and.push({ category: filter.category });
  if (filter.level) and.push({ level: filter.level });
  if (filter.action) and.push({ action: filter.action });
  if (filter.actorUuid) and.push({ actorUuid: filter.actorUuid });
  if (filter.projectUuid) and.push({ projectUuid: filter.projectUuid });
  if (filter.subjectType) and.push({ subjectType: filter.subjectType });
  if (filter.subjectUuid) and.push({ subjectUuid: filter.subjectUuid });
  if (filter.requestId) and.push({ requestId: filter.requestId });
  if (filter.from || filter.to) {
    and.push({ occurredAt: { gte: filter.from, lte: filter.to } });
  }
  if (filter.search?.trim()) {
    // The column collation is case- and accent-insensitive, so "andre" matches "André".
    // A leading wildcard cannot use an index; the UI always bounds the time range, which
    // is what keeps this scan small. FULLTEXT is the documented next step.
    const term = filter.search.trim();
    and.push({
      OR: [
        { summary: { contains: term } },
        { subjectLabel: { contains: term } },
        { actorName: { contains: term } },
        { projectName: { contains: term } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

type LogRow = Awaited<ReturnType<PrismaClient['log']['findFirstOrThrow']>>;

function toView(row: LogRow): LogEntryView {
  return {
    uuid: row.uuid,
    occurredAt: row.occurredAt,
    category: row.category,
    level: row.level,
    action: row.action,
    summary: row.summary,
    actor: row.actorUuid ? { uuid: row.actorUuid, name: row.actorName ?? 'Usuário' } : null,
    subject:
      row.subjectType && row.subjectUuid
        ? { type: row.subjectType, uuid: row.subjectUuid, label: row.subjectLabel }
        : null,
    project: row.projectUuid ? { uuid: row.projectUuid, name: row.projectName ?? 'Projeto' } : null,
    changes: Array.isArray(row.changes) ? (row.changes as unknown as FieldChange[]) : [],
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
    requestId: row.requestId,
  };
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function limitStack(metadata: Record<string, unknown>): Record<string, unknown> {
  const stack = metadata.stack;
  if (typeof stack === 'string' && stack.length > STACK_MAX) {
    return { ...metadata, stack: `${stack.slice(0, STACK_MAX)}…` };
  }
  return metadata;
}
