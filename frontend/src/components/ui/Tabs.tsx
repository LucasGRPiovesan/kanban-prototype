import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Shown beside the label when defined; `0` is shown too, because "none" is information. */
  count?: number;
}

export function tabId(tabsId: string, value: string): string {
  return `${tabsId}-tab-${value}`;
}

export function panelId(tabsId: string, value: string): string {
  return `${tabsId}-panel-${value}`;
}

/**
 * A real tablist: arrow keys move between tabs, Home/End jump to the ends, and only the
 * selected tab is in the tab order — the pattern a screen-reader user already knows.
 *
 * Underline style rather than pills: these tabs switch what a panel shows, and an
 * underline reads as "sections of this thing", where pills read as filters.
 */
export function Tabs<T extends string>({
  id,
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  id: string;
  items: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const index = items.findIndex((item) => item.value === value);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;

    event.preventDefault();
    const target = items[next];
    if (target) {
      onChange(target.value);
      document.getElementById(tabId(id, target.value))?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn('flex items-end gap-1 border-b border-line', className)}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            id={tabId(id, item.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(id, item.value)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative -mb-px flex items-center gap-1.5 px-3 pb-2.5 pt-1.5 text-sm font-semibold transition-colors duration-150',
              selected ? 'text-body' : 'text-muted hover:text-body',
            )}
          >
            {item.icon && <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-2xs font-bold tabular-nums transition-colors duration-150',
                  selected ? 'bg-brand-100 text-brand-800' : 'bg-surface-muted text-muted',
                )}
              >
                {item.count}
              </span>
            )}
            {/* The indicator grows from the centre so switching tabs reads as a move. */}
            <span
              className={cn(
                'absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-500 transition-transform duration-200 ease-smooth',
                selected ? 'scale-x-100' : 'scale-x-0',
              )}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  tabsId,
  value,
  active,
  children,
  className,
}: {
  tabsId: string;
  value: string;
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (!active) {
    return null;
  }
  return (
    <div
      role="tabpanel"
      id={panelId(tabsId, value)}
      aria-labelledby={tabId(tabsId, value)}
      className={cn('animate-fade-in', className)}
    >
      {children}
    </div>
  );
}
