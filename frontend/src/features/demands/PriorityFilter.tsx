import { cn } from '@/lib/cn';
import { DEMAND_PRIORITIES_ORDERED, PRIORITY_PRESENTATION } from './priority';
import type { DemandPriority } from '@/lib/api/types';

/** `null` reads as "Todas" — every priority, the filter's default. */
export type PriorityFilterValue = DemandPriority | null;

/**
 * The priority legend, turned into what people kept trying to use it as: a filter.
 *
 * A single-select segmented control, not a multi-select — "Todas" is a real option
 * (the default), the same way "Todos os projetos" is a real entry in the project combobox
 * rather than a cleared value. Each option still carries its icon and label, so the
 * control keeps doing what the legend did — saying what each priority icon means — while
 * also doing something with a click.
 */
export function PriorityFilter({
  value,
  onChange,
}: {
  value: PriorityFilterValue;
  onChange: (value: PriorityFilterValue) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Filtrar por prioridade"
      className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface-muted p-1"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        onClick={() => onChange(null)}
        className={cn(
          'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-150 ease-smooth',
          value === null ? 'bg-surface text-body shadow-subtle' : 'text-muted hover:text-body',
        )}
      >
        Todas
      </button>

      {DEMAND_PRIORITIES_ORDERED.map((priority) => {
        const presentation = PRIORITY_PRESENTATION[priority];
        const Icon = presentation.icon;
        const selected = value === priority;
        return (
          <button
            key={priority}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(selected ? null : priority)}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold',
              'transition-all duration-150 ease-smooth',
              selected ? 'bg-surface shadow-subtle' : 'text-muted hover:text-body',
              selected && presentation.accentClass,
            )}
          >
            <Icon className={cn('h-3.5 w-3.5 shrink-0', !selected && presentation.accentClass)} aria-hidden="true" />
            {presentation.label}
          </button>
        );
      })}
    </div>
  );
}
