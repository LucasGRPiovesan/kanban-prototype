import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { KANBAN_COLUMNS, STATUS_PRESENTATION } from '@/features/demands/status';
import type { Demand, DemandStatus } from '@/lib/api/types';

const MENU_WIDTH = 176;

/**
 * Broadcast the instant one menu opens, so every other instance on the board can close
 * itself — a plain DOM event rather than shared React state, since the board can render
 * dozens of these and none of their ancestors otherwise has a reason to know about them.
 */
const OPEN_EVENT = 'kanban:card-move-menu-open';

/**
 * A card's quick way to move columns without a drag gesture — shown in the same corner
 * the drag-handle hint used to occupy, revealed on the same hover/focus as that hint was.
 *
 * Portaled, like every other floating panel on this board: the trigger sits inside a
 * column that clips overflow for its scrollbar, and an inline dropdown would be cut off
 * the moment the card is anywhere but the top of the list.
 */
export function CardMoveMenu({
  demand,
  onMove,
}: {
  demand: Demand;
  onMove: (status: DemandStatus) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  // Another card's menu just opened — close this one, unless it is the one that opened.
  useEffect(() => {
    const onOtherOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) {
        setOpen(false);
      }
    };
    document.addEventListener(OPEN_EVENT, onOtherOpen);
    return () => document.removeEventListener(OPEN_EVENT, onOtherOpen);
  }, [id]);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    setPosition({ left: rect.right - MENU_WIDTH, top: rect.bottom + 4 });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Every handler on the trigger stops propagation: it sits inside the card, which is
  // itself the drag handle and the "open details" click target, and neither must react
  // to a click meant for this menu.
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Mover "${demand.title}" para outra coluna`}
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={(event) => {
          stop(event);
          setOpen((current) => {
            const next = !current;
            if (next) {
              document.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
            }
            return next;
          });
        }}
        className={cn(
          'absolute right-1 top-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-subtle',
          'opacity-0 transition-opacity duration-200 hover:bg-surface-muted hover:text-body group-hover:opacity-100',
          open && 'bg-surface-muted text-body opacity-100',
        )}
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open &&
        position &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            aria-label={`Mover "${demand.title}" para`}
            style={{ position: 'fixed', left: position.left, top: position.top, width: MENU_WIDTH }}
            onMouseDown={stop}
            className="z-[70] animate-rise-in space-y-0.5 rounded-xl border border-line bg-surface p-1.5 shadow-lifted"
          >
            {KANBAN_COLUMNS.map((status) => {
              const presentation = STATUS_PRESENTATION[status];
              const selected = status === demand.status;
              return (
                <li key={status}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={selected}
                    onClick={(event) => {
                      stop(event);
                      setOpen(false);
                      if (!selected) {
                        onMove(status);
                      }
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold',
                      'transition-colors duration-150',
                      selected ? 'cursor-default opacity-60' : 'cursor-pointer hover:bg-surface-muted',
                    )}
                  >
                    <span
                      className={cn('h-2 w-2 shrink-0 rounded-full', presentation.dotClass)}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{presentation.label}</span>
                    {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
