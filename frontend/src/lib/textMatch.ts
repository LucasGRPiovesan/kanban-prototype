/**
 * Accent-insensitive, case-insensitive substring matching — the one rule every free-text
 * filter in the app shares (Kanban search, the login screen's user picker), and the same
 * rule `<Highlight>` uses to mark up what matched. Centralized so "filtra à medida que
 * vai sendo preenchido" and "o que deu match" can never quietly disagree with each other.
 */
export function normalizeForSearch(text: string): string {
  // NFD splits an accented letter into its base letter plus a combining mark; stripping
  // the marks leaves one base character per original character, so a normalized string
  // is always the same length as its input — what makes `matchSegments` below safe to
  // slice the *original* string at offsets found in the *normalized* one.
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export interface TextSegment {
  text: string;
  matched: boolean;
}

/**
 * Splits `text` into matched/unmatched runs against `term`, for highlighting.
 *
 * Matching is accent- and case-insensitive, but every returned segment is sliced from
 * the original `text` — a search for "producao" against "Produção" highlights "Produção"
 * verbatim, accent and capitalization intact.
 */
export function matchSegments(text: string, term: string): TextSegment[] {
  const needle = normalizeForSearch(term.trim());
  if (!needle) {
    return [{ text, matched: false }];
  }
  const haystack = normalizeForSearch(text);
  const segments: TextSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) {
      segments.push({ text: text.slice(cursor), matched: false });
      break;
    }
    if (at > cursor) {
      segments.push({ text: text.slice(cursor, at), matched: false });
    }
    segments.push({ text: text.slice(at, at + needle.length), matched: true });
    cursor = at + needle.length;
  }
  return segments;
}

/** Whether any of `texts` contains `term`, the same rule `matchSegments` highlights. */
export function matchesSearch(term: string, ...texts: (string | null | undefined)[]): boolean {
  const needle = normalizeForSearch(term.trim());
  if (!needle) {
    return true;
  }
  return texts.some((text) => Boolean(text) && normalizeForSearch(text as string).includes(needle));
}
