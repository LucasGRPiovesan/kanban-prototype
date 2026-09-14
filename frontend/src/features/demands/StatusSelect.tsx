import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { KANBAN_COLUMNS, STATUS_PRESENTATION } from './status';
import type { DemandStatus } from '@/lib/api/types';

/**
 * Status, wearing the colour it wears on the board.
 *
 * A neutral dropdown would be the odd one out here: everywhere else in the product a
 * status is a coloured token, and reading "Em homologação" in plain grey forces the eye
 * to re-derive from words what colour already said. The trigger *is* the badge, and each
 * option is the same badge.
 *
 * Built as a listbox rather than a combobox, deliberately — five fixed options with no
 * text to search. A search field on an enumeration is furniture.
 */
export function StatusSelect({
  value,
  onChange,
  disabled = false,
  ariaLabel = 'Status da demanda',
}: {
  value: DemandStatus;
  onChange: (status: DemandStatus) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => KANBAN_COLUMNS.indexOf(value));
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(
    null,
  );

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const estimated = KANBAN_COLUMNS.length * 40 + 12;
    setPosition({
      left: rect.left,
      width: rect.width,
      // Flip above when the panel would run past the viewport — the details panel is
      // tall, and this control can sit near its bottom edge.
      top: below < estimated ? rect.top - estimated - 4 : rect.bottom + 4,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    setActiveIndex(KANBAN_COLUMNS.indexOf(value));
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure, value]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const commit = (status: DemandStatus) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (status !== value) {
      onChange(status);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (index + delta + KANBAN_COLUMNS.length) % KANBAN_COLUMNS.length);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      const status = KANBAN_COLUMNS[activeIndex];
      if (status) {
        commit(status);
      }
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      // Stopped so the surrounding dialog does not also close.
      event.stopPropagation();
      setOpen(false);
    }
  };

  const current = STATUS_PRESENTATION[value];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left',
          'text-xs font-semibold transition-all duration-200 ease-smooth',
          'hover:brightness-[0.97] disabled:cursor-not-allowed disabled:opacity-60',
          current.badgeClass,
        )}
      >
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', current.dotClass)}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{current.label}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-smooth',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open &&
        position &&
        createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              left: position.left,
              top: position.top,
              width: position.width,
            }}
            className="z-[70] animate-rise-in space-y-1 rounded-xl border border-line bg-surface p-1.5 shadow-lifted"
          >
            {KANBAN_COLUMNS.map((status, index) => {
              const presentation = STATUS_PRESENTATION[status];
              const selected = status === value;
              return (
                <li
                  key={status}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(status);
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5',
                    'text-xs font-semibold transition-all duration-150',
                    presentation.badgeClass,
                    index === activeIndex ? 'ring-2 ring-brand-500' : 'ring-0',
                  )}
                >
                  <span
                    className={cn('h-2 w-2 shrink-0 rounded-full', presentation.dotClass)}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{presentation.label}</span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
