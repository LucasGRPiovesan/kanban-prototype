import { describe, expect, it } from 'vitest';
import { brToIso, describeDueDate, initials, isoToBr, maskDateInput } from './format';

describe('Date mask', () => {
  it('discards non-digits as the user types', () => {
    expect(maskDateInput('abc')).toBe('');
    expect(maskDateInput('1a2b')).toBe('12');
    expect(maskDateInput('12/34')).toBe('12/34');
  });

  it('inserts separators progressively', () => {
    expect(maskDateInput('1')).toBe('1');
    expect(maskDateInput('14')).toBe('14');
    expect(maskDateInput('1403')).toBe('14/03');
    expect(maskDateInput('14032026')).toBe('14/03/2026');
  });

  it('never exceeds a full date', () => {
    expect(maskDateInput('140320269999')).toBe('14/03/2026');
  });
});

describe('Date conversion', () => {
  it('converts ISO to the Brazilian display format', () => {
    expect(isoToBr('2026-03-14')).toBe('14/03/2026');
  });

  it('converts a display date back to ISO', () => {
    expect(brToIso('14/03/2026')).toBe('2026-03-14');
  });

  it('rejects a date that does not exist in the calendar', () => {
    expect(brToIso('31/02/2026')).toBeNull();
    expect(brToIso('32/01/2026')).toBeNull();
    expect(brToIso('01/13/2026')).toBeNull();
  });

  it('accepts a leap day only in a leap year', () => {
    expect(brToIso('29/02/2028')).toBe('2028-02-29');
    expect(brToIso('29/02/2026')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(brToIso('14-03-2026')).toBeNull();
    expect(brToIso('')).toBeNull();
  });

  /**
   * The regression this guards: parsing '2026-03-14' with `new Date()` yields UTC
   * midnight, which renders as 13/03 in any timezone west of Greenwich.
   */
  it('does not shift a day across timezones', () => {
    expect(isoToBr('2026-01-01')).toBe('01/01/2026');
    expect(isoToBr('2026-12-31')).toBe('31/12/2026');
  });
});

describe('describeDueDate', () => {
  const today = new Date(2026, 2, 14); // 14 March 2026, local time

  it('flags an overdue deadline', () => {
    expect(describeDueDate('2026-03-13', today).tone).toBe('overdue');
    expect(describeDueDate('2026-03-13', today).label).toBe('Venceu ontem');
  });

  it('flags today and tomorrow', () => {
    expect(describeDueDate('2026-03-14', today).tone).toBe('today');
    expect(describeDueDate('2026-03-15', today).label).toBe('Vence amanhã');
  });

  it('treats the coming week as soon', () => {
    expect(describeDueDate('2026-03-20', today).tone).toBe('soon');
    expect(describeDueDate('2026-04-20', today).tone).toBe('normal');
  });
});

describe('initials', () => {
  it('uses the first and last name', () => {
    expect(initials('Joana Martins')).toBe('JM');
    expect(initials('Sofia Lima Braga')).toBe('SB');
  });

  it('falls back to the first two letters of a single name', () => {
    expect(initials('Ana')).toBe('AN');
  });

  it('handles empty input', () => {
    expect(initials('   ')).toBe('?');
  });
});
