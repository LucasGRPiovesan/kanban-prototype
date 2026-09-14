import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Inbox, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { KANBAN_COLUMNS, STATUS_PRESENTATION } from '@/features/demands/status';
import { cn } from '@/lib/cn';
import type { Demand, DemandStatus } from '@/lib/api/types';
import { DemandCard } from './DemandCard';

const PRODUCTION_LOCKED_MESSAGE =
  'Demandas em produção só podem ser revertidas por quem tem a permissão de gerenciar demandas em produção.';

export function KanbanBoard({
  demands,
  loading,
  canAddCard,
  canMove,
  canManageProduction,
  showProject,
  searchTerm = '',
  onOpen,
  onMove,
  addCardHref,
}: {
  demands: Demand[];
  loading: boolean;
  /**
   * Whether the per-column "+" is offered at all — DEMAND_CREATE together with
   * DEMAND_CREATE_WITH_STATUS, the capability that governs this one feature on its own.
   * Off, no column shows it; the ordinary "Nova Demanda" button, always NOT_STARTED,
   * still does everything it always did.
   */
  canAddCard: boolean;
  /**
   * Per-card, not a single board-wide switch: DEMAND_UPDATE alone says the profile may
   * move cards in general, but whether it may move *this one* also depends on whether
   * it belongs to them or the actor holds DEMAND_MANAGE_ALL — the same rule the server's
   * `DemandAccessGuard.loadManageable` enforces regardless of what this returns.
   */
  canMove: (demand: Demand) => boolean;
  /**
   * DEMAND_MANAGE_PRODUCTION — the one exception to "produção is terminal". Without it,
   * dragging a card into Em produção asks for confirmation first, since the record locks
   * for good the moment it lands; with it, produção is just another column, dragged into
   * and out of without a prompt.
   *
   * Every card stays draggable regardless — including one already in produção — so the
   * gesture always works the same way. What differs without the permission is only what
   * happens on drop: entering produção asks first, and leaving it is refused with an
   * explanation instead of silently doing nothing.
   */
  canManageProduction: boolean;
  /** False while the board is filtered to a single project, where the name is noise. */
  showProject: boolean;
  /** The active Kanban search term, if any — passed through only to highlight matches. */
  searchTerm?: string;
  onOpen: (uuid: string) => void;
  onMove: (uuid: string, status: DemandStatus) => void;
  /** Where a column's "+" leads — the new-demand form, pre-set to that status. */
  addCardHref: (status: DemandStatus) => string;
}) {
  const { notify } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingProductionMove, setPendingProductionMove] = useState<{
    uuid: string;
    title: string;
  } | null>(null);

  /**
   * Mouse and touch are separated deliberately, now that the whole card is the handle.
   *
   * A single PointerSensor would force `touch-action: none` across the entire card to
   * work on a phone, and that makes the column impossible to scroll with a finger. So
   * the mouse activates on a short travel, and touch activates on a press-and-hold —
   * which leaves a plain swipe free to scroll the column.
   */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter belongs to "open this card"; Space alone lifts it.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  /**
   * Cards are grouped by column while preserving the order the API returned, which is
   * due date ascending. Sorting is not repeated here: the backend owns that contract
   * and re-sorting client-side would let the two definitions drift.
   */
  const byStatus = useMemo(() => {
    const groups = new Map<DemandStatus, Demand[]>(KANBAN_COLUMNS.map((status) => [status, []]));
    for (const demand of demands) {
      groups.get(demand.status)?.push(demand);
    }
    return groups;
  }, [demands]);

  const activeDemand = activeId ? demands.find((demand) => demand.uuid === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  /**
   * The one place a target status turns into either a committed move, a confirmation
   * prompt, or a refusal — shared by the drag gesture and the per-card move menu, so the
   * production-lock rule is asked exactly once no matter which way someone moved the card.
   */
  const requestMove = useCallback(
    (demand: Demand, targetStatus: DemandStatus) => {
      if (targetStatus === demand.status) {
        return;
      }

      // Entering produção without DEMAND_MANAGE_PRODUCTION is a one-way door — the card
      // locks for good the instant it lands there — so this one move asks first instead
      // of committing the way every other one does. Not calling onMove at all leaves the
      // underlying data untouched, so the card simply stays put; there is nothing to
      // roll back.
      if (targetStatus === 'PRODUCTION' && !canManageProduction) {
        setPendingProductionMove({ uuid: demand.uuid, title: demand.title });
        return;
      }

      // Leaving produção without the permission: every way of moving a card is offered
      // regardless — nothing about the gesture itself hints that this particular move
      // will be refused — so the explanation has to come from here rather than from a
      // disabled affordance the person never got to try.
      if (demand.status === 'PRODUCTION' && !canManageProduction) {
        notify(PRODUCTION_LOCKED_MESSAGE, 'error');
        return;
      }

      // The mutation is optimistic and self-reverting, so an illegal move snaps back once
      // the server refuses it.
      onMove(demand.uuid, targetStatus);
    },
    [canManageProduction, notify, onMove],
  );

  const requestMoveByUuid = useCallback(
    (uuid: string, targetStatus: DemandStatus) => {
      const demand = demands.find((item) => item.uuid === uuid);
      if (demand) {
        requestMove(demand, targetStatus);
      }
    },
    [demands, requestMove],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) {
      return;
    }

    const demand = demands.find((item) => item.uuid === String(active.id));
    if (!demand) {
      return;
    }

    // The drop target is either a column or another card; resolve both to a status.
    const overStatus =
      (over.data.current?.status as DemandStatus | undefined) ?? (over.id as DemandStatus);
    if (!KANBAN_COLUMNS.includes(overStatus)) {
      return;
    }

    requestMove(demand, overStatus);
  };

  if (loading) {
    return (
      <div className="scroll-slim flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
        {KANBAN_COLUMNS.map((status, index) => (
          <div
            key={status}
            className="flex min-w-[15.5rem] flex-1 basis-0 animate-rise-in flex-col gap-2.5 rounded-2xl border border-line bg-surface-muted p-3"
            style={{ animationDelay: `${index * 45}ms` }}
          >
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Demanda ${active.id} selecionada para mover.`,
          onDragOver: ({ over }) =>
            over ? `Sobre a coluna ${labelOf(over.id)}.` : 'Fora de uma coluna válida.',
          onDragEnd: ({ over }) =>
            over ? `Demanda movida para ${labelOf(over.id)}.` : 'Movimentação cancelada.',
          onDragCancel: () => 'Movimentação cancelada.',
        },
      }}
    >
      {/*
        `min-h-0` is what makes the columns inherit the page's height instead of growing
        to their content: without it a flex child refuses to shrink below its intrinsic
        size and the board would run off the bottom of the screen.
      */}
      <div className="scroll-slim flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
        {KANBAN_COLUMNS.map((status, index) => (
          <Column
            key={status}
            status={status}
            index={index}
            demands={byStatus.get(status) ?? []}
            canMove={canMove}
            // Offered in every column but "Em produção": no demand may be born there,
            // for anyone, the same absolute rule the server enforces (mirroring the
            // integration API's own "nenhuma demanda nasce em produção").
            canAddHere={canAddCard && status !== 'PRODUCTION'}
            addCardHref={addCardHref(status)}
            showProject={showProject}
            searchTerm={searchTerm}
            dragging={activeId !== null}
            onOpen={onOpen}
            onMove={requestMoveByUuid}
          />
        ))}
      </div>

      {/*
        The overlay follows the cursor at the document level, so a dragged card is never
        clipped by a column's own scroll container.

        No `dropAnimation`, deliberately: dnd-kit's built-in one flies the overlay toward
        wherever the *real* card currently sits in the DOM, which at the exact instant a
        drag ends is still its old column — the move only reaches the board once the
        mutation's optimistic update lands, a beat later. With the animation on, that
        produces exactly the glitch this avoids: the card visibly snaps back to its old
        column before jumping to the one it was actually dropped on. Ending the drag with
        no flight animation means the overlay simply disappears and the real card appears
        in its new column the instant the optimistic update commits — later, not back.
      */}
      <DragOverlay dropAnimation={null}>
        {activeDemand && (
          <div className="w-[17rem]">
            <DemandCard
              demand={activeDemand}
              onOpen={() => undefined}
              draggable={false}
              showProject={showProject}
              overlay
            />
          </div>
        )}
      </DragOverlay>

      <ConfirmDialog
        open={pendingProductionMove !== null}
        title="Mover para produção"
        message={
          pendingProductionMove
            ? `Assim que "${pendingProductionMove.title}" entrar em produção, ela fica travada: só quem tiver a permissão de gerenciar demandas em produção poderá reverter e mudar o status dela de novo. Deseja continuar?`
            : ''
        }
        confirmLabel="Mover para produção"
        onConfirm={() => {
          if (pendingProductionMove) {
            onMove(pendingProductionMove.uuid, 'PRODUCTION');
          }
          setPendingProductionMove(null);
        }}
        onCancel={() => setPendingProductionMove(null)}
      />
    </DndContext>
  );
}

function Column({
  status,
  index,
  demands,
  canMove,
  canAddHere,
  addCardHref,
  showProject,
  searchTerm,
  dragging,
  onOpen,
  onMove,
}: {
  status: DemandStatus;
  index: number;
  demands: Demand[];
  canMove: (demand: Demand) => boolean;
  canAddHere: boolean;
  addCardHref: string;
  showProject: boolean;
  searchTerm?: string;
  /** True while any card is in flight, used to hint every column as a target. */
  dragging: boolean;
  onOpen: (uuid: string) => void;
  onMove: (uuid: string, status: DemandStatus) => void;
}) {
  const presentation = STATUS_PRESENTATION[status];
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { status } });

  return (
    // Columns share the width evenly and only start scrolling sideways once five of
    // them no longer fit at a readable width.
    <div
      className="flex min-w-[15.5rem] flex-1 basis-0 animate-rise-in flex-col gap-2"
      style={{ animationDelay: `${index * 45}ms` }}
    >
      {/* The title lives above the column now, not inside its coloured surface — read
          first, in the status's own colour, before the eye ever reaches a card. */}
      <header className="flex shrink-0 items-center gap-2 px-1">
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            presentation.dotClass,
            // The dot breathes only on the column being targeted — one moving thing
            // at a time, and only where the user is looking.
            isOver && 'animate-pulse-ring',
          )}
          aria-hidden="true"
        />
        <h2
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-bold tracking-tight',
            presentation.accentClass,
          )}
        >
          {presentation.label}
        </h2>
        {/*
          Keying on the value replays the entrance whenever the count changes, so a card
          arriving in a column is confirmed twice: once by the card, once by the tally.
        */}
        <span
          key={demands.length}
          className={cn(
            'animate-pop-in px-1 text-xs font-bold tabular-nums',
            presentation.accentClass,
          )}
        >
          {demands.length}
        </span>
      </header>

      <section
        aria-label={`${presentation.label}, ${demands.length} demandas`}
        className={cn(
          // Flat top, rounded bottom: the coloured top edge below reads as an extension
          // of the header above it, not as a fourth rounded corner competing with it.
          'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-2xl rounded-t-none border border-t-4',
          'transition-[box-shadow,background-color] duration-200 ease-smooth',
          presentation.columnClass,
          presentation.topBorderClass,
          // While a drag is under way every column reads as a target, and the one under
          // the pointer commits to it. Without the first step the board gives no hint
          // that a card can be dropped anywhere at all.
          //
          // Deliberately no transform here: a scaled ancestor would shift the coordinate
          // space dnd-kit measures the dragged card against, and the card would drift
          // away from the pointer.
          dragging && !isOver && 'ring-1 ring-inset ring-line-strong',
          isOver && 'shadow-lifted ring-2 ring-brand-500 ring-offset-2 ring-offset-canvas',
        )}
      >
        <div
          ref={setNodeRef}
          // The whole remaining height of the column is a drop target, so a card can be
          // released anywhere below the last one rather than only onto another card.
          className="scroll-slim stagger-tight min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2.5 py-3"
        >
          <SortableContext
            items={demands.map((d) => d.uuid)}
            strategy={verticalListSortingStrategy}
          >
            {demands.map((demand, cardIndex) => (
              <div key={demand.uuid} style={{ '--i': cardIndex } as React.CSSProperties}>
                <DemandCard
                  demand={demand}
                  onOpen={onOpen}
                  showProject={showProject}
                  searchTerm={searchTerm}
                  // Draggable regardless of status — including produção — as long as
                  // this specific card is the actor's to manage. Whether the drop
                  // actually goes through also depends on the produção permission,
                  // decided on drop.
                  draggable={canMove(demand)}
                  onMove={canMove(demand) ? (status) => onMove(demand.uuid, status) : undefined}
                />
              </div>
            ))}
          </SortableContext>

          {demands.length === 0 &&
            (isOver ? (
              <p className="flex h-full min-h-[7rem] items-center justify-center rounded-xl border border-dashed border-brand-500 bg-brand-50/60 px-2 text-center text-xs text-brand-800 transition-colors duration-200">
                Solte para mover para cá
              </p>
            ) : canAddHere ? (
              <AddCardButton status={status} href={addCardHref} />
            ) : (
              <p className="flex h-full min-h-[7rem] items-center justify-center rounded-xl border border-dashed border-line px-2 text-center text-xs text-subtle transition-colors duration-200">
                Nenhuma demanda aqui.
              </p>
            ))}

          {/* Outside the SortableContext: this is navigation, never a draggable item. */}
          {demands.length > 0 && canAddHere && <AddCardButton status={status} href={addCardHref} />}
        </div>
      </section>
    </div>
  );
}

/**
 * The Trello-style "+" under a column's last card — a dashed placeholder rather than a
 * solid button, so it reads as an empty slot to fill in, not one more card among cards.
 * A real `Link`, not a click handler: middle-click and "open in new tab" work exactly as
 * they do on "Nova Demanda", and it never competes with dnd-kit for the pointer.
 */
function AddCardButton({ status, href }: { status: DemandStatus; href: string }) {
  return (
    <Link
      to={href}
      className={cn(
        'press group flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-xl',
        'border border-dashed border-line-strong text-xs font-semibold text-subtle',
        'transition-colors duration-200 ease-smooth hover:border-brand-400 hover:bg-brand-50/60 hover:text-brand-700',
      )}
    >
      <Plus
        className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:scale-110"
        aria-hidden="true"
      />
      Adicionar demanda
      <span className="sr-only"> em {STATUS_PRESENTATION[status].label}</span>
    </Link>
  );
}

function labelOf(id: string | number): string {
  const status = String(id) as DemandStatus;
  return STATUS_PRESENTATION[status]?.label ?? String(id);
}

export function BoardEmptyState({
  action,
  title,
  description,
}: {
  action?: React.ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <div className="card-surface animate-rise-in">
      <EmptyState
        icon={<Inbox className="h-6 w-6" />}
        title={title ?? 'Nenhuma demanda encontrada'}
        description={description ?? 'Ajuste a busca ou cadastre a primeira demanda deste projeto.'}
        action={action}
      />
    </div>
  );
}
