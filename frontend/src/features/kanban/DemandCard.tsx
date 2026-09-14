import { useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, CalendarDays, FolderKanban, ListChecks, Lock, Paperclip } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Tooltip } from '@/components/ui/Tooltip';
import { DescriptionPreview } from '@/features/demands/DescriptionPreview';
import { Highlight } from '@/components/ui/Highlight';
import { PRIORITY_PRESENTATION } from '@/features/demands/priority';
import { STATUS_PRESENTATION } from '@/features/demands/status';
import { cn } from '@/lib/cn';
import { describeDueDate, isoToBr } from '@/lib/format';
import { projectLabel } from '@/features/demands/project';
import type { Demand, DemandStatus } from '@/lib/api/types';
import { DemandWatchToggle } from '@/features/notifications/DemandWatchToggle';
import { CardMoveMenu } from './CardMoveMenu';

/**
 * The due date carries the urgency, so it is the one place on the card that changes
 * colour: a chip the eye can scan down a column without reading a single date.
 */
const DUE_TONE: Record<ReturnType<typeof describeDueDate>['tone'], string> = {
  overdue: 'bg-danger-surface text-danger font-bold',
  today: 'bg-warning-surface text-warning font-bold',
  soon: 'bg-surface-muted text-muted font-semibold',
  normal: 'bg-surface-muted text-muted font-semibold',
};

/** Past this distance a pointer gesture was a drag, and the click it emits is noise. */
const CLICK_SLOP_PX = 6;

/**
 * A Kanban card.
 *
 * Three tiers, deliberately: the project it belongs to, whispered; the title, which is
 * what the card *is*; and a footer of facts. Everything optional lives in that footer as
 * an icon with a count, and appears only when it has something to report — a card with
 * no checklist and no attachments shows neither, so the ones that do carry them stand
 * out instead of blending into a row of empty placeholders.
 *
 * The entire card is the drag handle. That costs one thing — a plain `<button>` wrapper
 * can no longer own the click, because the button would swallow the pointer gesture
 * before dnd-kit sees it — so the article itself takes the role, the tab stop and the
 * keyboard handling, and a pointer gesture that travelled is not treated as a click.
 */
export function DemandCard({
  demand,
  onOpen,
  draggable,
  showProject = false,
  overlay = false,
  searchTerm = '',
  onMove,
}: {
  demand: Demand;
  onOpen: (uuid: string) => void;
  draggable: boolean;
  /** Only meaningful when the board spans several projects. */
  showProject?: boolean;
  /** Rendered inside the DragOverlay, where sortable transforms must not apply. */
  overlay?: boolean;
  /**
   * Moves the card without a drag gesture, via the corner menu. Omitted (or the card not
   * `draggable`) hides that menu entirely — the same permission gates both ways of moving
   * a card.
   */
  onMove?: (status: DemandStatus) => void;
  /** The active Kanban search term, if any — highlighted on the title and responsible. */
  searchTerm?: string;
}) {
  const sortable = useSortable({
    id: demand.uuid,
    data: { status: demand.status },
    disabled: !draggable,
  });

  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);

  const due = describeDueDate(demand.dueDate);
  // A delivered demand is not "late" any more, whatever its due date says: the red chip
  // would flag work that needs no action and dilute the cards that do.
  const dueTone = demand.isTerminal ? 'normal' : due.tone;
  const dueLabel = demand.isTerminal
    ? `Entregue — prazo era ${isoToBr(demand.dueDate)}`
    : due.label;
  const status = STATUS_PRESENTATION[demand.status];
  const priority = PRIORITY_PRESENTATION[demand.priority];
  const PriorityIcon = priority.icon;
  const checklist = demand.checklist ?? [];
  const checklistDone = checklist.filter((item) => item.done).length;
  const checklistComplete = checklist.length > 0 && checklistDone === checklist.length;

  const style = overlay
    ? undefined
    : {
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      };

  const open = () => onOpen(demand.uuid);

  const handlePointerDown = (event: React.PointerEvent) => {
    pointerOrigin.current = { x: event.clientX, y: event.clientY };
  };

  const handleClick = (event: React.MouseEvent) => {
    const origin = pointerOrigin.current;
    pointerOrigin.current = null;
    // A drag ends with a click event in most browsers. Measuring the distance the
    // pointer actually travelled separates "opened this card" from "moved this card"
    // without depending on dnd-kit's internal event bookkeeping.
    if (origin) {
      const travelled = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
      if (travelled > CLICK_SLOP_PX) {
        return;
      }
    }
    open();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Space is reserved for the keyboard sensor: it lifts the card. Enter opens it.
    if (event.key === 'Enter') {
      event.preventDefault();
      open();
    }
  };

  const dragProps = overlay || !draggable ? {} : { ...sortable.attributes, ...sortable.listeners };

  return (
    <article
      ref={overlay ? undefined : sortable.setNodeRef}
      style={style}
      {...dragProps}
      // dnd-kit's attributes already supply role and tabIndex when the card is
      // draggable; a card that cannot be moved still has to be reachable and openable.
      role="button"
      tabIndex={0}
      aria-label={
        draggable
          ? `${demand.title}. Enter abre os detalhes; espaço pega o card para mover entre colunas.`
          : `${demand.title}. Enter abre os detalhes.`
      }
      onPointerDown={overlay ? undefined : handlePointerDown}
      onClick={overlay ? undefined : handleClick}
      onKeyDown={overlay ? undefined : handleKeyDown}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-line bg-surface py-3.5 pl-4 pr-3.5 text-left shadow-card',
        !overlay &&
          'transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lifted',
        draggable && !overlay && 'cursor-grab active:cursor-grabbing',
        !draggable && !overlay && 'cursor-pointer',
        // The original stays in place at low opacity so the column never collapses
        // under the card being moved.
        !overlay && sortable.isDragging && 'opacity-40',
        // The lifted copy tilts a degree: enough to read as "picked up", not enough
        // to obscure what it says.
        overlay && 'rotate-2 cursor-grabbing shadow-panel ring-2 ring-brand-400',
      )}
    >
      {/* Status stripe on the leading edge, so a card keeps its identity anywhere. */}
      <span className={cn('absolute inset-y-0 left-0 w-1', status.dotClass)} aria-hidden="true" />

      {/*
        Title leads: it is what the card *is*, read before anything else. The extra
        right-side breathing room clears the move menu that appears in this corner on
        hover, so a long title never runs under it.
      */}
      <div className="flex items-start gap-2 pr-5">
        <Tooltip label={`Prioridade: ${priority.label}`} className="mt-0.5 shrink-0">
          <PriorityIcon
            className={cn('h-3.5 w-3.5', priority.accentClass)}
            aria-label={`Prioridade: ${priority.label}`}
          />
        </Tooltip>
        <h3 className="min-w-0 flex-1 text-[0.9375rem] font-semibold leading-snug tracking-tight text-body">
          <Highlight text={demand.title} term={searchTerm} />
        </h3>
        <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
          {!overlay && <DemandWatchToggle demand={demand} variant="card" />}
          <DescriptionPreview html={demand.description} />
          {demand.archived && (
            <Tooltip label="Arquivada">
              <Archive className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
            </Tooltip>
          )}
          {demand.isTerminal && (
            <Tooltip label="Em produção: registro congelado">
              <Lock className="h-3.5 w-3.5 shrink-0 text-status-production" aria-hidden="true" />
            </Tooltip>
          )}
        </span>
      </div>

      {/* Project, right under the title it belongs to — quieter than the title, but no
          longer competing with the row of counters and the due date for the eye. */}
      {showProject && (
        <p className="mt-1.5 flex items-center gap-1 text-[0.6875rem] font-semibold uppercase leading-none tracking-[0.04em] text-subtle">
          <FolderKanban className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{projectLabel(demand.project)}</span>
        </p>
      )}

      {/*
        Footer: who owns it, what it carries, when it is due. The responsible takes the
        space that is left so the counters and the date keep a fixed position from the
        right edge and line up down the column.
      */}
      <div className={cn('flex items-center gap-2', showProject ? 'mt-3' : 'mt-3.5')}>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <Avatar name={demand.responsible.name} src={demand.responsible.avatarUrl} size="xs" />
          {/* Not highlighted: the search box only matches the title now — see KanbanPage. */}
          <span className="min-w-0 truncate text-xs font-medium text-muted">
            {demand.responsible.name}
          </span>
        </span>

        {checklist.length > 0 && (
          <Meta
            label={`Checklist: ${checklistDone} de ${checklist.length} concluídos`}
            icon={<ListChecks className="h-3 w-3" aria-hidden="true" />}
            value={`${checklistDone}/${checklist.length}`}
            tone={checklistComplete ? 'done' : 'default'}
          />
        )}

        {demand.attachmentCount > 0 && (
          <Meta
            label={`${demand.attachmentCount} ${demand.attachmentCount === 1 ? 'anexo' : 'anexos'}`}
            icon={<Paperclip className="h-3 w-3" aria-hidden="true" />}
            value={String(demand.attachmentCount)}
          />
        )}

        <Tooltip label={dueLabel}>
          <span
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6875rem] leading-none tabular-nums',
              DUE_TONE[dueTone],
            )}
          >
            <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
            <time dateTime={demand.dueDate}>{isoToBr(demand.dueDate)}</time>
          </span>
        </Tooltip>
      </div>

      {draggable && !overlay && onMove && <CardMoveMenu demand={demand} onMove={onMove} />}
    </article>
  );
}

/**
 * One optional fact: an icon, a count, and a tooltip that says what it counts.
 *
 * The accessible name lives on the element itself rather than only in the tooltip, so
 * the count is never information that requires a pointer to reach.
 */
function Meta({
  label,
  icon,
  value,
  tone = 'default',
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  tone?: 'default' | 'done';
}) {
  return (
    <Tooltip label={label}>
      <span
        aria-label={label}
        className={cn(
          'flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 text-[0.6875rem] font-semibold leading-none tabular-nums transition-colors duration-150',
          tone === 'done' ? 'bg-success-surface text-success' : 'text-subtle',
        )}
      >
        {icon}
        {value}
      </span>
    </Tooltip>
  );
}
