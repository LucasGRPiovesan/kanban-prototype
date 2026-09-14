import { describe, expect, it } from 'vitest';
import {
  describeDaysToDue,
  describeDelta,
  formatDecimal,
  formatFullDate,
  formatPercent,
  formatShortDate,
} from './dashboardFormat';

describe('dashboard formatting', () => {
  it('writes numbers the way a Brazilian reader expects', () => {
    expect(formatDecimal(12.5)).toBe('12,5');
    expect(formatDecimal(3)).toBe('3');
    expect(formatPercent(0.666)).toBe('67%');
    expect(formatPercent(null)).toBe('—');
    expect(formatShortDate('2026-09-07')).toBe('07/09');
    expect(formatFullDate('2026-09-07')).toBe('07/09/2026');
  });

  it('describes a change against the previous period with its sign', () => {
    expect(describeDelta(5, 2)).toEqual({ direction: 'up', label: '+3 vs. período anterior' });
    expect(describeDelta(1, 4)).toEqual({ direction: 'down', label: '−3 vs. período anterior' });
    expect(describeDelta(2, 2)).toEqual({ direction: 'flat', label: 'igual ao período anterior' });
  });

  it('describes the distance to a due date', () => {
    expect(describeDaysToDue(-1)).toBe('Atrasada há 1 dia');
    expect(describeDaysToDue(-4)).toBe('Atrasada há 4 dias');
    expect(describeDaysToDue(0)).toBe('Vence hoje');
    expect(describeDaysToDue(2)).toBe('Vence em 2 dias');
  });
});
