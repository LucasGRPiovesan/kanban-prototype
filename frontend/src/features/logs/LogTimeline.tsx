import { Fragment, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Copy, ExternalLink, Filter, FolderKanban } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { STATUS_PRESENTATION } from '@/features/demands/status';
import { cn } from '@/lib/cn';
import { formatDateTime, formatTime } from '@/lib/relativeTime';
import type { LogEntry } from '@/lib/api/types';
import {
  LEVEL_PRESENTATION,
  SUBJECT_LABELS,
  SYSTEM_EVENT_LABELS,
  TONE_CLASSES,
  actionVisual,
  errorContextOf,
  fieldLabel,
  formatChangeValue,
  groupByDay,
  hasDetails,
  httpContextOf,
  isOpaqueChange,
  metadataItems,
  sentenceFor,
  stackOf,
  statusOf,
} from './logPresentation';

interface LogTimelineProps {
  entries: LogEntry[];
  /** `subject`: inside one demand's panel. `full`: the Logs screen. */
  variant: 'full' | 'subject';
  /** Catalog labels, when the caller has them; system events fall back to a local map. */
  actionLabels?: Record<string, string>;
  onFilterByRequest?: (requestId: string) => void;
  onOpenDemand?: (demandUuid: string) => void;
}

/**
 * A day-grouped, newest-first record of what happened.
 *
 * One component for both places a history is read — the Logs screen and a demand's
 * "Atualizações" tab — so an entry looks the same wherever it appears. The rail and the
 * tone of each node are the scan path: green where something was created, red where
 * something was removed or failed, amber where the system said no.
 */
export function LogTimeline({ entries, ...rest }: LogTimelineProps) {
  const groups = groupByDay(entries);

  return (
    <div className="space-y-7">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3 className="mb-3 flex items-center gap-3 text-xs font-bold text-subtle">
            {group.label}
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
          </h3>
          <ol>
            {group.entries.map((entry, index) => (
              <LogEntryItem
                key={entry.uuid}
                entry={entry}
                last={index === group.entries.length - 1}
                {...rest}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function LogEntryItem({
  entry,
  last,
  variant,
  actionLabels,
  onFilterByRequest,
  onOpenDemand,
}: Omit<LogTimelineProps, 'entries'> & { entry: LogEntry; last: boolean }) {
  const [open, setOpen] = useState(false);
  const visual = actionVisual(entry);
  const Icon = visual.icon;
  const isSystem = entry.category === 'SYSTEM';
  const level = LEVEL_PRESENTATION[entry.level];
  const statusChange =
    entry.action === 'demand.status_changed'
      ? entry.changes.find((change) => change.field === 'status')
      : undefined;
  // A deleted demand has nothing left to open.
  const demandSubject =
    variant === 'full' && entry.subject?.type === 'DEMAND' && entry.action !== 'demand.deleted'
      ? entry.subject
      : null;
  const expandable = hasDetails(entry);
  const detailsId = `log-details-${entry.uuid}`;

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last && (
        <span
          className="absolute bottom-1 left-4 top-10 w-px -translate-x-1/2 bg-line"
          aria-hidden="true"
        />
      )}
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
          TONE_CLASSES[visual.tone],
        )}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1 pt-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 break-words text-sm leading-snug text-body">
            {isSystem ? (
              <>
                <span className="font-semibold">
                  {actionLabels?.[entry.action] ?? SYSTEM_EVENT_LABELS[entry.action] ?? entry.action}
                </span>
                <span className="mt-0.5 block text-muted">{entry.summary}</span>
              </>
            ) : (
              <>
                <span className="font-semibold">{entry.actor?.name ?? 'Sistema'}</span>{' '}
                {sentenceFor(entry, variant)}
              </>
            )}
          </p>
          <time
            dateTime={entry.occurredAt}
            title={formatDateTime(entry.occurredAt)}
            className="shrink-0 pt-px text-xs tabular-nums text-subtle"
          >
            {formatTime(entry.occurredAt)}
          </time>
        </div>

        {statusChange && <StatusTransition from={statusChange.from} to={statusChange.to} />}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
          {isSystem && (
            <span
              className={cn(
                'rounded-full border px-2 py-px text-2xs font-semibold',
                TONE_CLASSES[level.tone],
              )}
            >
              {level.label}
            </span>
          )}
          {isSystem && entry.actor && (
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={entry.actor.name} size="xs" />
              {entry.actor.name}
            </span>
          )}
          {variant === 'full' && entry.project && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <FolderKanban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{entry.project.name}</span>
            </span>
          )}
          {variant === 'full' && isSystem && entry.subject && !demandSubject && (
            <span>
              {SUBJECT_LABELS[entry.subject.type]}
              {entry.subject.label ? ` ${entry.subject.label}` : ''}
            </span>
          )}
          {onOpenDemand && demandSubject && (
            <button
              type="button"
              onClick={() => onOpenDemand(demandSubject.uuid)}
              className="inline-flex items-center gap-1 rounded font-semibold text-brand-700 transition-colors hover:text-brand-800 hover:underline"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              Abrir demanda
            </button>
          )}
          {expandable && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailsId}
              onClick={() => setOpen((current) => !current)}
              className="inline-flex items-center gap-0.5 rounded font-semibold text-muted transition-colors hover:text-body"
            >
              {open ? 'Ocultar detalhes' : 'Detalhes'}
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
          )}
        </div>

        {open && <LogDetails id={detailsId} entry={entry} onFilterByRequest={onFilterByRequest} />}
      </div>
    </li>
  );
}

/**
 * The expandable "what exactly changed" panel: a before/after table, HTTP/error
 * context, remaining metadata, a stack trace, and the request id. Shared by the
 * timeline and by `LogsTable`'s expanded row, so an entry's details look identical
 * wherever they are opened.
 */
export function LogDetails({
  id,
  entry,
  onFilterByRequest,
}: {
  id: string;
  entry: LogEntry;
  onFilterByRequest?: (requestId: string) => void;
}) {
  const http = httpContextOf(entry);
  const error = errorContextOf(entry);
  const stack = stackOf(entry);
  const items = metadataItems(entry.metadata);

  return (
    <div
      id={id}
      className="mt-2.5 animate-rise-in space-y-3 rounded-xl border border-line bg-surface-muted/50 p-3.5 text-xs"
    >
      {entry.changes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[18rem] text-left">
            <caption className="sr-only">Alterações</caption>
            <thead>
              <tr className="text-subtle">
                <th scope="col" className="pb-1.5 pr-3 font-semibold">
                  Campo
                </th>
                <th scope="col" className="pb-1.5 pr-3 font-semibold">
                  Antes
                </th>
                <th scope="col" className="pb-1.5 font-semibold">
                  Depois
                </th>
              </tr>
            </thead>
            <tbody>
              {entry.changes.map((change) => (
                <tr key={change.field} className="border-t border-line align-top">
                  <th scope="row" className="py-1.5 pr-3 font-semibold text-body">
                    {fieldLabel(change.field)}
                  </th>
                  {isOpaqueChange(change) ? (
                    <td colSpan={2} className="py-1.5 text-muted">
                      Conteúdo alterado
                    </td>
                  ) : (
                    <>
                      <td className="py-1.5 pr-3 text-muted">
                        <ChangeValue field={change.field} value={change.from} />
                      </td>
                      <td className="py-1.5 font-medium text-body">
                        <ChangeValue field={change.field} value={change.to} />
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(http || error) && (
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5">
          {http && (
            <>
              <dt className="font-semibold text-subtle">Rota</dt>
              <dd className="min-w-0 break-all text-body">
                <span className="font-mono">
                  {http.method} {http.path}
                </span>
                {http.status !== null && (
                  <span
                    className={cn(
                      'ml-2 rounded-full border px-1.5 py-px text-2xs font-semibold',
                      TONE_CLASSES[http.status >= 500 ? 'danger' : 'warning'],
                    )}
                  >
                    {http.status}
                  </span>
                )}
              </dd>
            </>
          )}
          {error?.code && (
            <>
              <dt className="font-semibold text-subtle">Código</dt>
              <dd className="min-w-0 break-all font-mono text-body">{error.code}</dd>
            </>
          )}
          {error?.detail && (
            <>
              <dt className="font-semibold text-subtle">Mensagem</dt>
              <dd className="min-w-0 break-words text-body">{error.detail}</dd>
            </>
          )}
        </dl>
      )}

      {items.length > 0 && (
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5">
          {items.map((item) => (
            <Fragment key={item.key}>
              <dt className="font-semibold text-subtle">{item.label}</dt>
              <dd className="min-w-0 break-words text-body">
                {Array.isArray(item.value) ? (
                  <span className="flex flex-wrap gap-1">
                    {item.value.map((value) => (
                      <span
                        key={value}
                        className="rounded-md border border-line bg-surface px-1.5 py-px text-2xs font-semibold"
                      >
                        {value}
                      </span>
                    ))}
                  </span>
                ) : (
                  item.value
                )}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}

      {stack && (
        <details>
          <summary className="cursor-pointer font-semibold text-subtle transition-colors hover:text-body">
            Rastreamento da pilha
          </summary>
          <pre className="scroll-slim mt-2 max-h-56 overflow-auto whitespace-pre rounded-lg border border-line bg-surface p-2.5 font-mono text-2xs leading-relaxed text-muted">
            {stack}
          </pre>
        </details>
      )}

      {entry.requestId && <RequestIdRow requestId={entry.requestId} onFilter={onFilterByRequest} />}
    </div>
  );
}

function RequestIdRow({
  requestId,
  onFilter,
}: {
  requestId: string;
  onFilter?: (requestId: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context, denied permission): the id is still
      // selectable, which is the fallback the `select-all` below exists for.
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-2.5">
      <span className="font-semibold text-subtle">ID da requisição</span>
      <code className="select-all break-all font-mono text-2xs text-muted">{requestId}</code>
      <span className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 rounded font-semibold text-muted transition-colors hover:text-body"
        >
          {copied ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3" aria-hidden="true" />
          )}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        {onFilter && (
          <button
            type="button"
            onClick={() => onFilter(requestId)}
            className="inline-flex items-center gap-1 rounded font-semibold text-brand-700 transition-colors hover:text-brand-800 hover:underline"
          >
            <Filter className="h-3 w-3" aria-hidden="true" />
            Ver tudo desta requisição
          </button>
        )}
      </span>
    </div>
  );
}

function ChangeValue({ field, value }: { field: string; value: string | null }) {
  if (field === 'status' && statusOf(value)) {
    return <StatusPill value={value} />;
  }
  return <>{formatChangeValue(field, value)}</>;
}

function StatusTransition({ from, to }: { from: string | null; to: string | null }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <StatusPill value={from} />
      <ArrowRight className="h-3.5 w-3.5 text-subtle" aria-label="para" />
      <StatusPill value={to} />
    </p>
  );
}

function StatusPill({ value }: { value: string | null }) {
  const status = statusOf(value);
  if (!status) {
    return <span className="text-xs text-muted">{value ?? '—'}</span>;
  }
  const presentation = STATUS_PRESENTATION[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-px text-2xs font-semibold',
        presentation.badgeClass,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', presentation.dotClass)} aria-hidden="true" />
      {presentation.label}
    </span>
  );
}

/** Mirrors the timeline's shape: a node on the rail and two lines of text. */
export function LogTimelineSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <div className="shimmer h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="shimmer h-3.5 w-3/4 rounded-md" />
            <div className="shimmer h-3 w-1/3 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
