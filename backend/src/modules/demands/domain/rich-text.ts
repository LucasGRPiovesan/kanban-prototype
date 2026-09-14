import { DomainError } from '../../../shared/domain/errors';

const MIN_LENGTH = 3;
const MAX_LENGTH = 5000;
/** Formatting is cheap in bytes but not free; this bounds a pathological paste. */
const MAX_MARKUP_LENGTH = 40_000;

const BLOCK_BOUNDARY = /<\/(p|div|li|h[1-6]|blockquote|pre)>|<br\s*\/?>/gi;
const TAG = /<[^>]*>/g;

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/**
 * A demand's description, as rich text.
 *
 * The value object holds **already-sanitized** markup. Sanitization itself is a
 * boundary concern with a library behind it, so it lives in the application layer via
 * `HtmlSanitizer` — the domain must not import a parser, and it must not be the place
 * where a security decision quietly depends on a dependency version.
 *
 * What the domain does own is the rule that matters to the business: a description is
 * measured by what it *says*, not by the markup carrying it. Five hundred `<em>` tags
 * around three words is still three words, and a limit applied to the markup would
 * reject a perfectly ordinary paragraph that happened to be formatted.
 */
export class RichText {
  private constructor(
    private readonly html: string,
    readonly plainText: string,
  ) {}

  /**
   * @param sanitized markup that has already passed through `HtmlSanitizer`.
   */
  static fromSanitizedHtml(sanitized: string): RichText {
    const html = sanitized.trim();
    if (html.length > MAX_MARKUP_LENGTH) {
      throw DomainError.validation(
        'INVALID_DEMAND_DESCRIPTION',
        'A descrição excede o tamanho máximo permitido.',
      );
    }

    const plainText = RichText.toPlainText(html);
    if (plainText.length < MIN_LENGTH || plainText.length > MAX_LENGTH) {
      throw DomainError.validation(
        'INVALID_DEMAND_DESCRIPTION',
        `A descrição deve ter entre ${MIN_LENGTH} e ${MAX_LENGTH} caracteres de texto.`,
      );
    }

    return new RichText(html, plainText);
  }

  toString(): string {
    return this.html;
  }

  /**
   * Text content, for length rules and for anything that reads a description as words.
   *
   * Deliberately not a parser: this runs on markup the sanitizer has already reduced to
   * a known allowlist, so there is no adversarial input left to mis-handle here.
   */
  private static toPlainText(html: string): string {
    const withBreaks = html.replace(BLOCK_BOUNDARY, '\n');
    const stripped = withBreaks.replace(TAG, '');
    const decoded = stripped.replace(
      /&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g,
      (entity) => ENTITIES[entity] ?? entity,
    );
    return decoded.replace(/\n{3,}/g, '\n\n').trim();
  }
}
