import { Avatar } from '@/components/ui/Avatar';
import { Tooltip } from '@/components/ui/Tooltip';
import { STATUS_PRESENTATION } from '@/features/demands/status';
import { cn } from '@/lib/cn';
import type { Dashboard } from '@/lib/api/types';
import { formatShortDate, plural } from './dashboardFormat';

/*
 * Hand-built charts, on purpose: four simple forms (a proportion bar, a bar list, a
 * grouped column chart, stacked bars) do not justify a charting dependency, and building
 * them on the design tokens keeps them in the theme automatically.
 *
 * Mark specs follow one set of rules throughout: bars at most 24px thick with 4px
 * rounded data-ends and a square baseline, a 2px surface gap between touching segments,
 * hairline solid gridlines, values in text colours (never the series colour), a legend
 * whenever there is more than one series, a tooltip on hover *and* keyboard focus, and
 * every value also reachable without hovering — through the legend, the labels or a data
 * table.
 */

export interface Segment {
  key: string;
  label: string;
  count: number;
  swatch: string;
}

const percentOf = (count: number, total: number) =>
  total > 0 ? `${Math.round((count / total) * 100)}%` : '—';

/** A single part-to-whole bar with its legend — the value of every part is always printed. */
export function ProportionBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const visible = segments.filter((segment) => segment.count > 0);

  return (
    <div className="space-y-3">
      <div role="group" aria-label={label} className="flex h-3.5 gap-[2px]">
        {total === 0 ? (
          <div className="h-full w-full rounded bg-surface-muted" />
        ) : (
          visible.map((segment, index) => {
            const text = `${segment.label}: ${segment.count} (${percentOf(segment.count, total)})`;
            return (
              <div
                key={segment.key}
                className="h-full min-w-[6px]"
                style={{ flexGrow: segment.count, flexBasis: 0 }}
              >
                <Tooltip label={text} className="flex h-full w-full">
                  <span
                    tabIndex={0}
                    aria-label={text}
                    className={cn(
                      'block h-full w-full outline-none transition-opacity duration-150 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-brand-500',
                      index === 0 && 'rounded-l-[4px]',
                      index === visible.length - 1 && 'rounded-r-[4px]',
                      segment.swatch,
                    )}
                  />
                </Tooltip>
              </div>
            );
          })
        )}
      </div>

      <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 2xl:grid-cols-3">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', segment.swatch)} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-muted">{segment.label}</span>
            <span className="font-semibold tabular-nums text-body">{segment.count}</span>
            <span className="w-9 text-right text-xs tabular-nums text-subtle">
              {percentOf(segment.count, total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Demands per status, in board order. Each bar wears its column's colour — the same
 * identity the Kanban uses — and each row is named, so the colour is never the label.
 */
export function StatusBars({ distribution }: { distribution: Dashboard['statusDistribution'] }) {
  const max = Math.max(1, ...distribution.map((entry) => entry.count));
  const total = distribution.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <ul className="space-y-2.5">
      {distribution.map(({ status, count }) => {
        const presentation = STATUS_PRESENTATION[status];
        const text = `${presentation.label}: ${count} ${plural(count, 'demanda', 'demandas')}`;
        return (
          <li
            key={status}
            className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_4.5rem] items-center gap-3"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', presentation.dotClass)} aria-hidden="true" />
              <span className="truncate">{presentation.label}</span>
            </span>
            <Tooltip label={text} className="flex h-6 w-full items-center border-l border-line-strong">
              <span
                tabIndex={count > 0 ? 0 : -1}
                aria-label={text}
                className={cn(
                  'block h-2.5 rounded-r-[4px] outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  presentation.dotClass,
                )}
                style={{ width: count > 0 ? `max(4px, ${(count / max) * 100}%)` : 0 }}
              />
            </Tooltip>
            <span className="text-right text-sm tabular-nums">
              <span className="font-semibold text-body">{count}</span>{' '}
              <span className="text-xs text-subtle">{percentOf(count, total)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function LegendSwatch({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-sm', swatch)} aria-hidden="true" />
      {label}
    </span>
  );
}

const ARRIVALS = 'bg-[rgb(var(--chart-arrivals))]';
const DELIVERIES = 'bg-[rgb(var(--chart-deliveries))]';

/**
 * Arrivals against deliveries, week by week. The one question this answers is whether
 * the team is keeping up: arrivals persistently above deliveries is a backlog that grows,
 * whatever any single week looks like. Two series on one scale — never two axes.
 */
export function WeeklyFlowChart({ weekly }: { weekly: Dashboard['weekly'] }) {
  const max = Math.max(0, ...weekly.flatMap((week) => [week.arrivals, week.deliveries]));
  const top = Math.max(2, Math.ceil(max / 2) * 2);
  const ticks = [top, top / 2, 0];
  const at = (value: number) => `${(1 - value / top) * 100}%`;

  const describe = (week: Dashboard['weekly'][number]) =>
    `Semana de ${formatShortDate(week.weekStart)}${week.partial ? ' (em andamento)' : ''}: ` +
    `${week.arrivals} ${plural(week.arrivals, 'entrada', 'entradas')}, ` +
    `${week.deliveries} ${plural(week.deliveries, 'entrega', 'entregas')}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <LegendSwatch swatch={ARRIVALS} label="Entradas (demandas criadas)" />
        <LegendSwatch swatch={DELIVERIES} label="Entregas (chegaram à produção)" />
      </div>

      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
        <div className="relative h-44 text-right text-2xs tabular-nums text-subtle" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: at(tick) }}>
              {tick}
            </span>
          ))}
        </div>

        <div className="relative h-44">
          {ticks.map((tick) => (
            <span
              key={tick}
              aria-hidden="true"
              className={cn('absolute inset-x-0 h-px', tick === 0 ? 'bg-line-strong' : 'bg-line')}
              style={{ top: at(tick) }}
            />
          ))}
          <div className="absolute inset-0 flex gap-1" role="group" aria-label="Entradas e entregas por semana">
            {weekly.map((week) => {
              const text = describe(week);
              return (
                <Tooltip
                  key={week.weekStart}
                  label={text}
                  className={cn('flex h-full flex-1 rounded-t-md', week.partial && 'bg-surface-muted')}
                >
                  <span
                    tabIndex={0}
                    aria-label={text}
                    className="flex h-full w-full items-end justify-center gap-[2px] rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {[
                      { value: week.arrivals, swatch: ARRIVALS },
                      { value: week.deliveries, swatch: DELIVERIES },
                    ].map((column, index) => (
                      <span
                        key={index}
                        className={cn('block w-full max-w-[14px] rounded-t-[4px]', column.swatch)}
                        style={{ height: column.value > 0 ? `max(3px, ${(column.value / top) * 100}%)` : 0 }}
                      />
                    ))}
                  </span>
                </Tooltip>
              );
            })}
          </div>
        </div>

        <span aria-hidden="true" />
        <div className="mt-1.5 flex gap-1" aria-hidden="true">
          {weekly.map((week) => (
            <span key={week.weekStart} className="flex-1 text-center text-2xs tabular-nums text-subtle">
              {formatShortDate(week.weekStart)}
              {week.partial && <span className="block">atual</span>}
            </span>
          ))}
        </div>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer font-semibold text-muted transition-colors hover:text-body">
          Ver dados em tabela
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-subtle">
              <tr>
                <th scope="col" className="py-1 pr-3 font-semibold">Semana de</th>
                <th scope="col" className="py-1 pr-3 text-right font-semibold">Entradas</th>
                <th scope="col" className="py-1 text-right font-semibold">Entregas</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map((week) => (
                <tr key={week.weekStart} className="border-t border-line">
                  <td className="py-1 pr-3 text-muted">
                    {formatShortDate(week.weekStart)}
                    {week.partial ? ' (em andamento)' : ''}
                  </td>
                  <td className="py-1 pr-3 text-right text-body">{week.arrivals}</td>
                  <td className="py-1 text-right text-body">{week.deliveries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

const WORKLOAD_LIMIT = 8;

/**
 * Open work per person, split by how urgent it is. Bar length is the load; the red and
 * amber parts are the share of it that is late or due within a week — so an overloaded
 * person and a person holding the late work are both visible at once.
 */
export function WorkloadBars({ workload }: { workload: Dashboard['workload'] }) {
  const rows = workload.slice(0, WORKLOAD_LIMIT);
  const hidden = workload.length - rows.length;
  const max = Math.max(1, ...rows.map((row) => row.open));

  if (rows.length === 0) {
    return <p className="text-sm text-muted">Ninguém com demandas em aberto.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <LegendSwatch swatch="bg-danger" label="Atrasadas" />
        <LegendSwatch swatch="bg-warning" label="Vencem em até 7 dias" />
        <LegendSwatch swatch="bg-subtle/50" label="Demais em aberto" />
      </div>
      <ul className="space-y-2.5">
        {rows.map((row) => {
          const segments = [
            { key: 'overdue', label: 'Atrasadas', count: row.overdue, swatch: 'bg-danger' },
            { key: 'soon', label: 'Vencem em até 7 dias', count: row.dueSoon, swatch: 'bg-warning' },
            {
              key: 'rest',
              label: 'Demais em aberto',
              count: row.open - row.overdue - row.dueSoon,
              swatch: 'bg-subtle/50',
            },
          ].filter((segment) => segment.count > 0);

          return (
            <li
              key={row.responsible.uuid}
              className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2rem] items-center gap-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={row.responsible.name} size="xs" />
                <span className="truncate text-sm text-body">{row.responsible.name}</span>
              </span>
              <div className="flex h-6 items-center">
                <div className="flex h-2.5 gap-[2px]" style={{ width: `${(row.open / max) * 100}%` }}>
                  {segments.map((segment, index) => {
                    const text = `${row.responsible.name} — ${segment.label}: ${segment.count}`;
                    return (
                      <div
                        key={segment.key}
                        className="h-full min-w-[4px]"
                        style={{ flexGrow: segment.count, flexBasis: 0 }}
                      >
                        <Tooltip label={text} className="flex h-full w-full">
                          <span
                            tabIndex={0}
                            aria-label={text}
                            className={cn(
                              'block h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                              index === segments.length - 1 && 'rounded-r-[4px]',
                              segment.swatch,
                            )}
                          />
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
              </div>
              <span className="text-right text-sm font-semibold tabular-nums text-body">{row.open}</span>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <p className="text-xs text-subtle">
          E mais {hidden} {plural(hidden, 'pessoa', 'pessoas')} com menos demandas em aberto.
        </p>
      )}
    </div>
  );
}
