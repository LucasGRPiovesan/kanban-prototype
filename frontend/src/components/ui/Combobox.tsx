import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, SearchX } from 'lucide-react';
import { cn } from '@/lib/cn';
import { controlClasses } from './Field';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional second line, e.g. the role beside a person's name. */
  hint?: string;
}

interface ListboxPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  above: boolean;
}

const GAP_PX = 4;
const MIN_PANEL_PX = 160;

/**
 * The application's only select.
 *
 * Every dropdown in the product goes through here — project filters, role pickers, the
 * responsible picker — so they share one appearance, one keyboard contract and one
 * search behaviour instead of a native `<select>` in some places and this in others.
 *
 * Built to the ARIA combobox pattern: arrow keys move an active option, Enter commits,
 * Escape closes, and `aria-activedescendant` keeps assistive technology in step with the
 * visual highlight. Closed, it reads as a select; open, it is a search field — which is
 * the behaviour a native `<select>` cannot offer and the reason this exists.
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = 'Selecione',
  searchPlaceholder = 'Buscar...',
  emptyMessage = 'Nenhum resultado encontrado',
  disabled = false,
  invalid = false,
  describedBy,
  loading = false,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: {
  id?: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  loading?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<ListboxPosition | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const term = query.trim();
    if (!term) {
      return options;
    }
    // Accent-insensitive so "andre" finds "André". \p{M} strips the combining marks
    // that NFD decomposition leaves behind.
    const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const normalized = normalize(term);
    return options.filter(
      (option) =>
        normalize(option.label).includes(normalized) ||
        (option.hint ? normalize(option.hint).includes(normalized) : false),
    );
  }, [options, query]);

  /**
   * The list is measured against the viewport and rendered in a portal.
   *
   * An absolutely positioned dropdown is clipped by any scrolling ancestor, and these
   * selects live inside modal bodies and scrolling panels — so the options would
   * disappear behind the panel edge exactly where they are most needed.
   */
  const measure = useCallback(() => {
    const trigger = containerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP_PX;
    const above = rect.top - GAP_PX;
    // Flip upwards only when below genuinely cannot hold a usable panel and above can.
    const flip = below < MIN_PANEL_PX && above > below;
    setPosition({
      left: rect.left,
      width: rect.width,
      top: flip ? rect.top - GAP_PX : rect.bottom + GAP_PX,
      maxHeight: Math.min(288, Math.max(MIN_PANEL_PX, flip ? above : below)),
      above: flip,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    measure();
    // `true` captures scrolls on any ancestor, not just the window, which is what moves
    // the trigger when the select sits inside a modal body.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) {
      return;
    }
    listRef.current.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const commit = (option: ComboboxOption) => {
    onChange(option.value);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (filtered.length === 0) {
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (index + delta + filtered.length) % filtered.length);
      return;
    }
    if (event.key === 'Enter' && open) {
      const option = filtered[activeIndex];
      if (option) {
        event.preventDefault();
        commit(option);
      }
      return;
    }
    if (event.key === 'Escape' && open) {
      // Stopped here so Escape closes the list without also closing the dialog around it.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setQuery('');
    }
    if (event.key === 'Tab' && open) {
      setOpen(false);
      setQuery('');
    }
  };

  // Closed, the control shows the chosen label like a select. Open, it is a search box.
  const displayValue = open ? query : (selected?.label ?? '');

  const listbox = open && position && (
    <ul
      ref={listRef}
      id={listboxId}
      role="listbox"
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
        ...(position.above ? { bottom: window.innerHeight - position.top } : { top: position.top }),
      }}
      className="scroll-slim z-[70] animate-rise-in overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface py-1 shadow-lifted"
    >
      {loading && <li className="px-3 py-2.5 text-sm text-subtle">Carregando...</li>}

      {!loading && filtered.length === 0 && (
        <li className="flex items-center gap-2 px-3 py-3 text-sm text-muted">
          <SearchX className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
          {emptyMessage}
        </li>
      )}

      {!loading &&
        filtered.map((option, index) => {
          const isActive = index === activeIndex;
          const isSelected = option.value === value;
          return (
            <li
              key={option.value}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={isSelected}
              data-active={isActive}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => {
                // Commit before the input loses focus, or the blur handler closes the
                // list and the click never lands.
                event.preventDefault();
                commit(option);
              }}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm transition-colors duration-100',
                isActive ? 'bg-brand-100 text-brand-900' : 'text-body',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.label}</span>
                {option.hint && (
                  <span
                    className={cn(
                      'block truncate text-2xs',
                      isActive ? 'text-brand-800' : 'text-subtle',
                    )}
                  >
                    {option.hint}
                  </span>
                )}
              </span>
              {isSelected && (
                <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
              )}
            </li>
          );
        })}
    </ul>
  );

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* The magnifier appears only while searching, so the closed control reads as a
          select rather than as a search field that happens to have a value. */}
      <Search
        className={cn(
          'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle transition-opacity duration-150',
          open ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && filtered[activeIndex] ? `${listboxId}-${activeIndex}` : undefined
        }
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        value={displayValue}
        placeholder={open ? searchPlaceholder : placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Selecting an option (or Escape) closes the list without blurring the input —
        // the whole point, so typing a fresh search doesn't need a re-click first. But an
        // already-focused input never fires `focus` again, so a plain re-click needs its
        // own handler or the list stays shut until focus is lost and regained elsewhere.
        onClick={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={cn(
          controlClasses(invalid),
          'cursor-pointer pr-9',
          open ? 'cursor-text pl-9' : 'pl-3',
          size === 'sm' ? 'h-10 text-sm' : 'h-11',
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? 'Fechar lista' : 'Abrir lista'}
        disabled={disabled}
        onMouseDown={(event) => {
          // Keep focus on the input: the combobox role lives there, and letting the
          // button take focus would close the list the click just asked to open.
          event.preventDefault();
        }}
        onClick={() => {
          setOpen((current) => !current);
          inputRef.current?.focus();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-subtle transition-colors duration-150 hover:text-body disabled:opacity-50"
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 transition-transform duration-200 ease-smooth',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {listbox && createPortal(listbox, document.body)}
    </div>
  );
}
