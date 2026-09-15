/**
 * Date handling at the presentation boundary.
 *
 * The UI speaks DD/MM/AAAA, the API speaks YYYY-MM-DD. Both are treated as calendar
 * dates and parsed field-by-field — never through `new Date('2026-03-14')`, which is
 * interpreted as UTC midnight and renders as the previous day for anyone west of
 * Greenwich. That single conversion bug is why these helpers exist.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

// The system is Brazil-only: "today" for due-date math is Brasília's calendar day,
// not the viewer's own machine/browser timezone.
const TIME_ZONE = 'America/Sao_Paulo';
const CALENDAR_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function isoToBr(iso: string): string {
  const match = ISO.exec(iso);
  if (!match) {
    return '';
  }
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function brToIso(br: string): string | null {
  const match = BR.exec(br.trim());
  if (!match) {
    return null;
  }
  const [, day, month, year] = match;
  if (!isRealDate(Number(year), Number(month), Number(day))) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

export function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2999) {
    return false;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/**
 * Progressive DD/MM/AAAA mask. Non-digits are discarded as the user types, which is
 * how the specification's "only numbers" rule is enforced without fighting the caret.
 */
export function maskDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Relative deadline wording — the board's most-read piece of information. */
export function describeDueDate(
  iso: string,
  today = new Date(),
): {
  label: string;
  tone: 'overdue' | 'today' | 'soon' | 'normal';
} {
  const match = ISO.exec(iso);
  if (!match) {
    return { label: '', tone: 'normal' };
  }
  const [, y, m, d] = match;
  const due = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const [ny, nm, nd] = CALENDAR_DATE.format(today).split('-').map(Number);
  const now = Date.UTC(ny!, nm! - 1, nd!);
  const days = Math.round((due - now) / 86_400_000);

  if (days < 0) {
    return {
      label: days === -1 ? 'Venceu ontem' : `Venceu há ${Math.abs(days)} dias`,
      tone: 'overdue',
    };
  }
  if (days === 0) {
    return { label: 'Vence hoje', tone: 'today' };
  }
  if (days === 1) {
    return { label: 'Vence amanhã', tone: 'soon' };
  }
  if (days <= 7) {
    return { label: `Vence em ${days} dias`, tone: 'soon' };
  }
  return { label: `Vence em ${days} dias`, tone: 'normal' };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Two-letter monogram used by the card and details avatars. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}
