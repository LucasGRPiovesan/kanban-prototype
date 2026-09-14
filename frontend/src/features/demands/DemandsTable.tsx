import { Archive, ChevronRight, CalendarDays, FolderKanban } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { describeDueDate, isoToBr } from '@/lib/format';
import { DescriptionPreview } from './DescriptionPreview';
import { PRIORITY_PRESENTATION } from './priority';
import { STATUS_PRESENTATION } from './status';
import { projectLabel } from './project';
import type { Demand } from '@/lib/api/types';

/**
 * The Demandas screen's table — one row per demand, indexed columns, nothing that
 * scrolls forever. The same shape as `LogsTable` on purpose: this screen is a history,
 * exactly what the Logs table already exists to scan, and a real table is what stays
 * practical once the count is in the hundreds — the reason every real record browser
 * (a database console, the Logs screen itself) is a table, never a growing list of cards.
 *
 * A row carries what identifies a demand at a glance: priority, title, project,
 * responsible, status, prazo. There is no inline expand — clicking the title or the
 * trailing chevron opens the same `DemandDetailsPanel` the Kanban card opens, so a demand
 * only ever has one "full details" surface in the product, not a second, narrower one
 * duplicated here.
 */
export function DemandsTable({
  demands,
  onOpen,
}: {
  demands: Demand[];
  onOpen: (uuid: string) => void;
}) {
  return (
    <div className="scroll-slim overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-muted/60 text-xs font-semibold text-subtle">
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Demanda
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Projeto
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">
              Responsável
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">
              Status
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">
              Prazo
            </th>
            <th scope="col" className="w-10 px-2 py-2.5">
              <span className="sr-only">Abrir</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {demands.map((demand) => (
            <DemandTableRow key={demand.uuid} demand={demand} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DemandTableRow({
  demand,
  onOpen,
}: {
  demand: Demand;
  onOpen: (uuid: string) => void;
}) {
  const status = STATUS_PRESENTATION[demand.status];
  const priority = PRIORITY_PRESENTATION[demand.priority];
  const PriorityIcon = priority.icon;
  const due = describeDueDate(demand.dueDate);

  return (
    <tr
      onClick={() => onOpen(demand.uuid)}
      className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-muted/50"
    >
      <td className="min-w-[16rem] px-4 py-2.5 align-top">
        <button
          type="button"
          onClick={(event) => {
            // The row already opens on click; without this the row's own handler
            // would fire a second time as the event bubbles past this button.
            event.stopPropagation();
            onOpen(demand.uuid);
          }}
          className="flex items-start gap-2 text-left"
        >
          <PriorityIcon
            className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', priority.accentClass)}
            aria-label={`Prioridade: ${priority.label}`}
          />
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="font-semibold text-body hover:underline">{demand.title}</span>
            {demand.archived && (
              <Tooltip label="Arquivada">
                <Archive className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
              </Tooltip>
            )}
            <DescriptionPreview html={demand.description} />
          </span>
        </button>
      </td>

      <td className="min-w-[9rem] px-4 py-2.5 align-top text-xs text-muted">
        <span className="flex items-center gap-1">
          <FolderKanban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className={cn('truncate', !demand.project && 'italic text-subtle')}>
            {projectLabel(demand.project)}
          </span>
        </span>
      </td>

      <td className="whitespace-nowrap px-4 py-2.5 align-top">
        <span className="flex items-center gap-1.5">
          <Avatar
            name={demand.responsible.name}
            src={demand.responsible.avatarUrl}
            size="xs"
          />
          <span className="text-sm text-body">{demand.responsible.name}</span>
        </span>
      </td>

      <td className="whitespace-nowrap px-4 py-2.5 align-top">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-semibold',
            status.badgeClass,
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', status.dotClass)} aria-hidden="true" />
          {status.label}
        </span>
      </td>

      <td className="whitespace-nowrap px-4 py-2.5 align-top">
        <span
          className={cn(
            'flex items-center gap-1 text-xs',
            due.tone === 'overdue' && !demand.isTerminal ? 'font-semibold text-danger' : 'text-muted',
          )}
        >
          <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
          <time dateTime={demand.dueDate} title={demand.isTerminal ? 'Demanda entregue' : due.label}>
            {isoToBr(demand.dueDate)}
          </time>
        </span>
      </td>

      <td className="px-2 py-2.5 align-top">
        <button
          type="button"
          aria-label={`Abrir detalhes de ${demand.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(demand.uuid);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-muted hover:text-body"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

/** Mirrors the table's shape while the first page loads. */
export function DemandsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <div className="shimmer h-3.5 w-1/3 rounded-md" />
          <div className="shimmer h-3.5 w-24 shrink-0 rounded-md" />
          <div className="shimmer ml-auto h-3.5 w-20 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}
