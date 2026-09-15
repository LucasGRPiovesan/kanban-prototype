// The system is Brazil-only: every timestamp shown to a user is pinned to Brasília time,
// regardless of the viewer's own machine/browser timezone setting.
const TIME_ZONE = 'America/Sao_Paulo';

const RELATIVE = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: TIME_ZONE,
});
const DAY_SAME_YEAR = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: TIME_ZONE,
});
const DAY_OTHER_YEAR = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TIME_ZONE,
});
const CALENDAR_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const YEAR_IN_ZONE = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric' });
const DAY_OTHER_YEAR_SHORT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: TIME_ZONE,
});

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "há 5 minutos", "ontem", "há 3 dias" — then a date.
 *
 * Relative phrasing stops being useful after about a week: "há 23 dias" makes the reader
 * do arithmetic that a date would not. Past that point the absolute date is clearer.
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);

  if (abs < 45) {
    return 'agora';
  }
  if (abs < HOUR) {
    return RELATIVE.format(Math.round(seconds / MINUTE), 'minute');
  }
  if (abs < DAY) {
    return RELATIVE.format(Math.round(seconds / HOUR), 'hour');
  }
  if (abs < 7 * DAY) {
    return RELATIVE.format(Math.round(seconds / DAY), 'day');
  }
  return DAY_OTHER_YEAR_SHORT.format(date);
}

/** Full timestamp for tooltips: the precise moment behind a relative label. */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso)).replace(',', ' às');
}

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso));
}

/** Brasília calendar day, for grouping a timeline under day headings. */
export function dayKey(iso: string): string {
  return CALENDAR_DATE.format(new Date(iso));
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) {
    return 'Hoje';
  }
  const yesterday = new Date(now.getTime() - DAY * 1000);
  if (key === dayKey(yesterday.toISOString())) {
    return 'Ontem';
  }
  const date = new Date(iso);
  const label =
    YEAR_IN_ZONE.format(date) === YEAR_IN_ZONE.format(now)
      ? DAY_SAME_YEAR.format(date)
      : DAY_OTHER_YEAR.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
