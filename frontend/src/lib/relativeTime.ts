const RELATIVE = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const DAY_SAME_YEAR = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const DAY_OTHER_YEAR = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

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
  return date.toLocaleDateString('pt-BR');
}

/** Full timestamp for tooltips: the precise moment behind a relative label. */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso)).replace(',', ' às');
}

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso));
}

/** Local calendar day, for grouping a timeline under day headings. */
export function dayKey(iso: string): string {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) {
    return 'Hoje';
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === dayKey(yesterday.toISOString())) {
    return 'Ontem';
  }
  const date = new Date(iso);
  const label =
    date.getFullYear() === now.getFullYear() ? DAY_SAME_YEAR.format(date) : DAY_OTHER_YEAR.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
