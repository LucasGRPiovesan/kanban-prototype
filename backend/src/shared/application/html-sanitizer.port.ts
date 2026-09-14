/**
 * Reduces untrusted markup to a known-safe subset.
 *
 * This is a port, not a helper, for one reason: it is a security boundary. Rich text
 * arrives from a browser editor, is stored, and is later rendered as HTML by another
 * browser — so anything that survives this step executes in someone else's session.
 *
 * The frontend sanitizes again before rendering. That is not redundancy for its own
 * sake: the API is a public surface and will happily accept a hand-written request that
 * never touched the editor, while stored rows outlive whatever client wrote them.
 */
export interface HtmlSanitizer {
  /** Returns markup containing only allowed tags and attributes. */
  sanitize(html: string): string;
}
