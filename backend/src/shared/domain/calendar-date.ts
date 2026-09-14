import { DomainError } from './errors';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A calendar date (no time, no timezone) — the correct type for a demand's due date.
 *
 * Storing a deadline as a timestamp makes it shift across timezones; "31/12" would
 * render as "30/12" for a user in UTC-3. This value object keeps the date whole and
 * only touches UTC when crossing the persistence boundary.
 */
export class CalendarDate {
  private constructor(private readonly iso: string) {}

  static fromISO(value: string): CalendarDate {
    if (!ISO_DATE.test(value)) {
      throw DomainError.validation('INVALID_DATE', `Data inválida: "${value}". Formato esperado: YYYY-MM-DD.`);
    }
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
      throw DomainError.validation('INVALID_DATE', `Data inexistente no calendário: "${value}".`);
    }
    return new CalendarDate(value);
  }

  /** Reads a persisted DATE column back as a calendar date, ignoring the driver's time part. */
  static fromDate(date: Date): CalendarDate {
    const iso = date.toISOString().slice(0, 10);
    return new CalendarDate(iso);
  }

  static today(now: Date = new Date()): CalendarDate {
    return CalendarDate.fromDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  }

  toISO(): string {
    return this.iso;
  }

  /** UTC midnight — the only representation that survives a MySQL DATE round trip unchanged. */
  toUTCDate(): Date {
    return new Date(`${this.iso}T00:00:00.000Z`);
  }

  isBefore(other: CalendarDate): boolean {
    return this.iso < other.iso;
  }

  equals(other: CalendarDate): boolean {
    return this.iso === other.iso;
  }
}
