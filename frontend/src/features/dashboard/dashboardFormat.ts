import type { DashboardDueBucket } from '@/lib/api/types';

const DECIMAL = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function formatDecimal(value: number): string {
  return DECIMAL.format(value);
}

export function formatPercent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

/** "07/09" — axis and list labels, where the year is implied by the period. */
export function formatShortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

export function formatFullDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export interface Delta {
  direction: 'up' | 'down' | 'flat';
  label: string;
}

export function describeDelta(current: number, previous: number): Delta {
  const difference = current - previous;
  if (difference === 0) {
    return { direction: 'flat', label: 'igual ao período anterior' };
  }
  return {
    direction: difference > 0 ? 'up' : 'down',
    label: `${difference > 0 ? '+' : '−'}${Math.abs(difference)} vs. período anterior`,
  };
}

export function describeDaysToDue(days: number): string {
  if (days < 0) {
    const late = -days;
    return `Atrasada há ${late} ${plural(late, 'dia', 'dias')}`;
  }
  if (days === 0) {
    return 'Vence hoje';
  }
  return `Vence em ${days} ${plural(days, 'dia', 'dias')}`;
}

/**
 * Due-date buckets, ordered by urgency. The colour steps down with it — the status
 * tokens for the two that call for action today, neutral steps for the rest — and every
 * bucket is always named and counted in the legend, so no reading depends on hue alone.
 */
export const DUE_BUCKETS: Record<DashboardDueBucket, { label: string; swatch: string }> = {
  overdue: { label: 'Atrasadas', swatch: 'bg-danger' },
  today: { label: 'Vencem hoje', swatch: 'bg-warning' },
  week: { label: 'Em 1 a 7 dias', swatch: 'bg-warning/45' },
  month: { label: 'Em 8 a 30 dias', swatch: 'bg-subtle/70' },
  later: { label: 'Em mais de 30 dias', swatch: 'bg-line-strong' },
};
