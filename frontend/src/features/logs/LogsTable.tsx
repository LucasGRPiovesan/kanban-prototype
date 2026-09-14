import { Fragment, useState } from 'react';
import { ChevronDown, ExternalLink, FolderKanban } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/relativeTime';
import type { LogCategory, LogEntry } from '@/lib/api/types';
import { LogDetails } from './LogTimeline';
import {
  LEVEL_PRESENTATION,
  SUBJECT_LABELS,
  SYSTEM_EVENT_LABELS,
  TONE_CLASSES,
  actionVisual,
  hasDetails,
} from './logPresentation';

interface LogsTableProps {
  entries: LogEntry[];
  category: LogCategory;
  actionLabels: Record<string, string>;
  onFilterByRequest: (requestId: string) => void;
  onOpenDemand: (demandUuid: string) => void;
}

/**
 * A real log table: one row per entry, indexed columns, nothing that scrolls forever.
 *
 * The timeline reads well for a handful of events inside one demand's panel, but a
 * screen whose entire job is scanning hundreds of entries needs the density and the
 * scan lines a table gives — the same reason a real log viewer (Splunk, CloudWatch,
 * the browser's own Network panel) is always a table, never a chat thread. Each row
 * carries just enough to recognize the entry; the rest — before/after values, request
 * context, a stack trace — stays behind a details toggle instead of crowding every row.
 */
export function LogsTable({
  entries,
  category,
  actionLabels,
  onFilterByRequest,
  onOpenDemand,
}: LogsTableProps) {
  const [expandedUuid, setExpandedUuid] = useState<string | null>(null);
  const isSystem = category === 'SYSTEM';
  const columnCount = isSystem ? 6 : 5;

  return (
    <div className="scroll-slim overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-muted/60 text-xs font-semibold text-subtle">
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">
              Quando
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">
              Pessoa
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Evento
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              {isSystem ? 'Assunto' : 'Projeto'}
            </th>
            {isSystem && (
              <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">
                Nível
              </th>
            )}
            <th scope="col" className="w-10 px-2 py-2.5">
              <span className="sr-only">Detalhes</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <LogTableRow
              key={entry.uuid}
              entry={entry}
              isSystem={isSystem}
              columnCount={columnCount}
              expanded={expandedUuid === entry.uuid}
              onToggle={() =>
                setExpandedUuid((current) => (current === entry.uuid ? null : entry.uuid))
              }
              actionLabel={actionLabels[entry.action]}
              onFilterByRequest={onFilterByRequest}
              onOpenDemand={onOpenDemand}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogTableRow({
  entry,
  isSystem,
  columnCount,
  expanded,
  onToggle,
  actionLabel,
  onFilterByRequest,
  onOpenDemand,
}: {
  entry: LogEntry;
  isSystem: boolean;
  columnCount: number;
  expanded: boolean;
  onToggle: () => void;
  actionLabel: string | undefined;
  onFilterByRequest: (requestId: string) => void;
  onOpenDemand: (demandUuid: string) => void;
}) {
  const visual = actionVisual(entry);
  const Icon = visual.icon;
  const level = LEVEL_PRESENTATION[entry.level];
  const expandable = hasDetails(entry);
  const detailsId = `log-row-details-${entry.uuid}`;
  // A deleted demand has nothing left to open.
  const demandSubject =
    entry.subject?.type === 'DEMAND' && entry.action !== 'demand.deleted' ? entry.subject : null;

  return (
    <Fragment>
      <tr className={cn('border-b border-line last:border-0', expanded ? 'bg-brand-50' : 'hover:bg-surface-muted/50')}>
        <td
          className="whitespace-nowrap px-4 py-2.5 align-top text-xs text-muted"
          title={formatDateTime(entry.occurredAt)}
        >
          {formatDateTime(entry.occurredAt)}
        </td>

        <td className="whitespace-nowrap px-4 py-2.5 align-top">
          {entry.actor ? (
            <span className="flex items-center gap-1.5">
              <Avatar name={entry.actor.name} size="xs" />
              <span className="text-sm text-body">{entry.actor.name}</span>
            </span>
          ) : (
            <span className="text-sm italic text-subtle">Sistema</span>
          )}
        </td>

        <td className="min-w-[16rem] px-4 py-2.5 align-top">
          <span className="flex items-start gap-2">
            <span
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                TONE_CLASSES[visual.tone],
              )}
              aria-hidden="true"
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-body">
                {actionLabel ?? SYSTEM_EVENT_LABELS[entry.action] ?? entry.action}
              </span>
              <span className="block truncate text-xs text-muted" title={entry.summary}>
                {entry.summary}
              </span>
            </span>
          </span>
        </td>

        <td className="min-w-[10rem] px-4 py-2.5 align-top text-xs text-muted">
          <span className="flex flex-col gap-1">
            {entry.project ? (
              <span className="flex min-w-0 items-center gap-1">
                <FolderKanban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{entry.project.name}</span>
              </span>
            ) : entry.subject ? (
              <span className="truncate">
                {SUBJECT_LABELS[entry.subject.type]}
                {entry.subject.label ? `: ${entry.subject.label}` : ''}
              </span>
            ) : (
              '—'
            )}
            {demandSubject && (
              <button
                type="button"
                onClick={() => onOpenDemand(demandSubject.uuid)}
                className="inline-flex items-center gap-1 self-start rounded font-semibold text-brand-700 transition-colors hover:text-brand-800 hover:underline"
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                Abrir demanda
              </button>
            )}
          </span>
        </td>

        {isSystem && (
          <td className="whitespace-nowrap px-4 py-2.5 align-top">
            <span
              className={cn(
                'inline-flex rounded-full border px-2 py-px text-2xs font-semibold',
                TONE_CLASSES[level.tone],
              )}
            >
              {level.label}
            </span>
          </td>
        )}

        <td className="px-2 py-2.5 align-top">
          {expandable && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailsId}
              aria-label={expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
              title={expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
              onClick={onToggle}
              className="flex h-7 w-7 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-muted hover:text-body"
            >
              <ChevronDown
                className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-line last:border-0 bg-surface-muted/30">
          <td colSpan={columnCount} className="px-4 py-3">
            <LogDetails id={detailsId} entry={entry} onFilterByRequest={onFilterByRequest} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** Mirrors the table's shape while the first page loads. */
export function LogsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <div className="shimmer h-3.5 w-20 shrink-0 rounded-md" />
          <div className="shimmer h-6 w-6 shrink-0 rounded-full" />
          <div className="shimmer h-3.5 w-1/3 rounded-md" />
          <div className="shimmer ml-auto h-3.5 w-24 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}
