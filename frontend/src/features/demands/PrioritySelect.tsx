import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DEMAND_PRIORITIES_ORDERED, PRIORITY_PRESENTATION } from './priority';
import type { DemandPriority } from '@/lib/api/types';

/**
 * Priority, wearing the colour it wears everywhere else.
 *
 * Same shape as `StatusSelect` on purpose — a coloured trigger that *is* the badge, a
 * listbox of four fixed options with no text to search — but priority carries no
 * lifecycle of its own, so unlike status this control has no illegal transitions to
 * enforce: any option can follow any other.
 */
export function PrioritySelect({
  value,
  onChange,
  disabled = false,
  ariaLabel = 'Prioridade da demanda',
  id,
  describedBy,
}: {
  value: DemandPriority;
  onChange: (priority: DemandPriority) => void;
  disabled?: boolean;
  ariaLabel?: string;
  /** Lets a wrapping `<label htmlFor>` reach the trigger, as `Field` expects. */
  id?: string;
  describedBy?: string;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => DEMAND_PRIORITIES_ORDERED.indexOf(value));
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
    const estimated = DEMAND_PRIORITIES_ORDERED.length * 40 + 12;
    setPosition({
      left: rect.left,
      width: rect.width,
      top: below < estimated ? rect.top - estimated - 4 : rect.bottom + 4,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    setActiveIndex(DEMAND_PRIORITIES_ORDERED.indexOf(value));
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

  const commit = (priority: DemandPriority) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (priority !== value) {
      onChange(priority);
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
      setActiveIndex(
        (index) => (index + delta + DEMAND_PRIORITIES_ORDERED.length) % DEMAND_PRIORITIES_ORDERED.length,
      );
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      const priority = DEMAND_PRIORITIES_ORDERED[activeIndex];
      if (priority) {
        commit(priority);
      }
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  const current = PRIORITY_PRESENTATION[value];
  const CurrentIcon = current.icon;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-describedby={describedBy}
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
        <CurrentIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
            {DEMAND_PRIORITIES_ORDERED.map((priority, index) => {
              const presentation = PRIORITY_PRESENTATION[priority];
              const Icon = presentation.icon;
              const selected = priority === value;
              return (
                <li
                  key={priority}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(priority);
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5',
                    'text-xs font-semibold transition-all duration-150',
                    presentation.badgeClass,
                    index === activeIndex ? 'ring-2 ring-brand-500' : 'ring-0',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
