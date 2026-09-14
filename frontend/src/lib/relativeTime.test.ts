import { describe, expect, it } from 'vitest';
import { dayKey, dayLabel, formatRelative } from './relativeTime';

// Local wall-clock dates: grouping by day is about the reader's calendar, not UTC's.
const now = new Date(2026, 8, 10, 15, 0, 0);
const at = (days: number, hours = 0, minutes = 0) =>
  new Date(2026, 8, 10 + days, 15 + hours, minutes).toISOString();

describe('formatRelative', () => {
  it('says "agora" for the last few seconds', () => {
    expect(formatRelative(new Date(now.getTime() - 20_000).toISOString(), now)).toBe('agora');
  });

  it('counts minutes, then hours, then days', () => {
    expect(formatRelative(at(0, 0, -5), now)).toBe('há 5 minutos');
    expect(formatRelative(at(0, -3), now)).toBe('há 3 horas');
    expect(formatRelative(at(-3), now)).toBe('há 3 dias');
  });

  it('switches to a date once relative phrasing stops helping', () => {
    expect(formatRelative(at(-12), now)).toBe('29/08/2026');
  });
});

describe('dayLabel', () => {
  it('names today and yesterday, and spells out older days', () => {
    expect(dayLabel(at(0, -2), now)).toBe('Hoje');
    expect(dayLabel(at(-1), now)).toBe('Ontem');
    expect(dayLabel(at(-5), now)).toMatch(/^[A-ZÀ-Ý].*5 de setembro$/);
  });

  it('adds the year for another year', () => {
    expect(dayLabel(new Date(2025, 11, 31, 10).toISOString(), now)).toBe('31 de dezembro de 2025');
  });
});

describe('dayKey', () => {
  it('uses the local calendar day', () => {
    expect(dayKey(new Date(2026, 8, 10, 23, 59).toISOString())).toBe('2026-09-10');
    expect(dayKey(new Date(2026, 8, 11, 0, 1).toISOString())).toBe('2026-09-11');
  });
});
