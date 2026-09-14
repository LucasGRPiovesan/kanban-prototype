/** Small text helpers shared by everything that feeds a model or reads its answer. */

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * A value placed inside the prompt's data block, one fact per line.
 *
 * Demand titles and descriptions are typed by users, so they are neutralised before they
 * reach the model: no line breaks to forge a new record, no `|` to shift a column, and no
 * angle brackets to close the `<dados>` block and speak as the system.
 */
export function dataCell(value: string): string {
  return oneLine(value).replace(/\|/g, '/').replace(/[<>]/g, '');
}

/** Rich-text markup reduced to the words a reader sees. */
export function plainText(html: string, max: number): string {
  const text = html
    .replace(/<\/(p|li|h[1-6]|blockquote|pre)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  return clip(oneLine(text), max);
}

/**
 * Case-, accent- and punctuation-insensitive key, so "Validar e-mail" and "validar email"
 * count as the same step. Punctuation is dropped rather than turned into a space — the
 * hyphen in "e-mail" would otherwise make it a different word.
 */
export function comparableKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
