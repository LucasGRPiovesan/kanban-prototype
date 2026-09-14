import { useState } from 'react';
import {
  CalendarDays,
  ChevronRight,
  FolderKanban,
  ListChecks,
  Lock,
  Paperclip,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Feedback';
import { Tooltip } from '@/components/ui/Tooltip';
import { DescriptionPreview } from '@/features/demands/DescriptionPreview';
import { Highlight } from '@/components/ui/Highlight';
import { PRIORITY_PRESENTATION } from '@/features/demands/priority';
import { KANBAN_COLUMNS, STATUS_PRESENTATION } from '@/features/demands/status';
import { cn } from '@/lib/cn';
import { projectLabel } from '@/features/demands/project';
import { describeDueDate, isoToBr } from '@/lib/format';
import type { Demand, DemandStatus } from '@/lib/api/types';

const DUE_TONE: Record<ReturnType<typeof describeDueDate>['tone'], string> = {
  overdue: 'text-danger font-bold',
  today: 'text-warning font-bold',
  soon: 'text-muted font-medium',
  normal: 'text-muted font-medium',
};

/**
 * The board's other reading.
 *
 * The Kanban answers "where is everything?"; this answers "what is there, in order?".
 * Same data, same grouping by status, same due-date ordering — laid out as rows so a
 * long backlog can be scanned without dragging five columns across the screen.
 *
 * Deliberately not draggable. Moving work between stages is a spatial act and the board
 * already does it well; repeating it here would mean two implementations of the same
 * rule, and this view's job is reading.
 */
export function DemandListView({
  demands,
  loading,
  showProject,
  searchTerm = '',
  onOpen,
}: {
  demands: Demand[];
  loading: boolean;
  showProject: boolean;
  /** The active Kanban search term, if any — highlighted on the title and responsible. */
  searchTerm?: string;
  onOpen: (uuid: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<DemandStatus>>(new Set());

  const toggle = (status: DemandStatus) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });

  if (loading) {
    return (
      <div className="space-y-3">
        {KANBAN_COLUMNS.slice(0, 3).map((status) => (
          <div key={status} className="space-y-2">
            <Skeleton className="h-8 w-48 rounded-lg" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto pb-2">
      <div className="stagger space-y-5">
        {KANBAN_COLUMNS.map((status, index) => {
          const presentation = STATUS_PRESENTATION[status];
          const rows = demands.filter((demand) => demand.status === status);
          const isCollapsed = collapsed.has(status);

          return (
            <section key={status} style={{ '--i': index } as React.CSSProperties}>
              <h2>
                <button
                  type="button"
                  onClick={() => toggle(status)}
                  aria-expanded={!isCollapsed}
                  className="group flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors duration-150 hover:bg-surface-muted"
                >
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 shrink-0 text-subtle transition-transform duration-200 ease-smooth',
                      !isCollapsed && 'rotate-90',
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn('h-2.5 w-2.5 shrink-0 rounded-full', presentation.dotClass)}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-bold tracking-tight text-body">
                    {presentation.label}
                  </span>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-2xs font-bold tabular-nums text-muted">
                    {rows.length}
                  </span>
                </button>
              </h2>

              {!isCollapsed && (
                <div className="mt-1.5 overflow-hidden rounded-xl border border-line">
                  {rows.length === 0 ? (
                    <p className="bg-surface px-4 py-5 text-center text-xs text-subtle">
                      Nenhuma demanda nesta etapa.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {rows.map((demand) => (
                        <li key={demand.uuid}>
                          <Row
                            demand={demand}
                            accent={presentation.dotClass}
                            showProject={showProject}
                            searchTerm={searchTerm}
                            onOpen={onOpen}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  demand,
  accent,
  showProject,
  searchTerm = '',
  onOpen,
}: {
  demand: Demand;
  accent: string;
  showProject: boolean;
  searchTerm?: string;
  onOpen: (uuid: string) => void;
}) {
  const due = describeDueDate(demand.dueDate);
  const checklist = demand.checklist ?? [];
  const checklistDone = checklist.filter((item) => item.done).length;
  const priority = PRIORITY_PRESENTATION[demand.priority];
  const PriorityIcon = priority.icon;

  return (
    <button
      type="button"
      onClick={() => onOpen(demand.uuid)}
      className="flex w-full items-center gap-3 bg-surface px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-muted"
      aria-label={`Abrir detalhes da demanda ${demand.title}`}
    >
      <span className={cn('h-7 w-1 shrink-0 rounded-full', accent)} aria-hidden="true" />

      {demand.previewThumbnailUrl && (
        <img
          src={demand.previewThumbnailUrl}
          alt=""
          loading="lazy"
          className="h-8 w-8 shrink-0 rounded-md border border-line object-cover"
        />
      )}

      {/* The one flexible column: it claims whatever the fixed-width fields below leave
          behind, which is what keeps every one of them at the same x position down the
          whole list — the reason to read this view rather than the board. */}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <Tooltip label={`Prioridade: ${priority.label}`} className="shrink-0">
            <PriorityIcon
              className={cn('h-3.5 w-3.5', priority.accentClass)}
              aria-label={`Prioridade: ${priority.label}`}
            />
          </Tooltip>
          <span className="truncate text-sm font-semibold text-body">
            <Highlight text={demand.title} term={searchTerm} />
          </span>
          {demand.isTerminal && (
            <Lock
              className="h-3 w-3 shrink-0 text-status-production"
              aria-label="Demanda em produção: status bloqueado"
            />
          )}
          <DescriptionPreview html={demand.description} />
        </span>
      </span>

      {/* The same optional indicators the card shows, so both readings report the
          same facts about a demand. */}
      {checklist.length > 0 && (
        <Tooltip
          label={`Checklist: ${checklistDone} de ${checklist.length} concluídos`}
          className="hidden shrink-0 sm:inline-flex"
        >
          <span
            aria-label={`Checklist: ${checklistDone} de ${checklist.length} concluídos`}
            className={cn(
              'flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[0.6875rem] font-semibold tabular-nums',
              checklistDone === checklist.length
                ? 'bg-success-surface text-success'
                : 'text-subtle',
            )}
          >
            <ListChecks className="h-3 w-3" aria-hidden="true" />
            {checklistDone}/{checklist.length}
          </span>
        </Tooltip>
      )}

      {demand.attachmentCount > 0 && (
        <Tooltip
          label={`${demand.attachmentCount} ${demand.attachmentCount === 1 ? 'anexo' : 'anexos'}`}
          className="hidden shrink-0 sm:inline-flex"
        >
          <span
            aria-label={`${demand.attachmentCount} anexos`}
            className="flex items-center gap-0.5 text-[0.6875rem] font-semibold tabular-nums text-subtle"
          >
            <Paperclip className="h-3 w-3" aria-hidden="true" />
            {demand.attachmentCount}
          </span>
        </Tooltip>
      )}

      {/*
        Fixed-width columns on the right, so project, responsible and date line up down
        the list instead of drifting with each title's length — the reason to read this
        view rather than the board. Project sits right before responsible, not right
        after the title, precisely so nothing variable (checklist, attachments) comes
        between it and the row's true right-anchored tail — that variable gap is exactly
        what left it drifting left/right from one row to the next.
      */}
      {showProject && (
        <span className="hidden w-32 shrink-0 items-center gap-1 text-2xs text-subtle md:flex">
          <FolderKanban className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className={cn('truncate', !demand.project && 'italic')}>
            {projectLabel(demand.project)}
          </span>
        </span>
      )}

      <span className="hidden w-44 shrink-0 items-center gap-2 sm:flex">
        <Avatar name={demand.responsible.name} src={demand.responsible.avatarUrl} size="xs" />
        {/* Not highlighted: the search box only matches the title now — see KanbanPage. */}
        <span className="truncate text-xs text-muted">{demand.responsible.name}</span>
      </span>

      <span
        className={cn(
          'flex w-[6.5rem] shrink-0 items-center justify-end gap-1 text-xs tabular-nums',
          // Delivered work is not late — same rule as the card.
          DUE_TONE[demand.isTerminal ? 'normal' : due.tone],
        )}
      >
        <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
        <time dateTime={demand.dueDate} title={demand.isTerminal ? 'Demanda entregue' : due.label}>
          {isoToBr(demand.dueDate)}
        </time>
      </span>
    </button>
  );
}
