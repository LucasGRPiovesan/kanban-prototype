import sanitizeHtml from 'sanitize-html';
import { type HtmlSanitizer } from '../application/html-sanitizer.port';

/**
 * The allowlist is deliberately narrower than what the editor's toolbar offers.
 *
 * An allowlist is the only defensible shape here: a denylist has to anticipate every
 * vector, and it is always one browser quirk behind. Anything not named below — script,
 * style, iframe, object, every `on*` handler, every unknown attribute — is dropped.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'h2',
  'h3',
  'a',
];

export class SanitizeHtmlAdapter implements HtmlSanitizer {
  sanitize(html: string): string {
    return sanitizeHtml(html, {
      allowedTags: ALLOWED_TAGS,
      // Only links carry attributes. `rel` and `target` are listed because the transform
      // below forces them — without that, the allowlist would strip the very protection
      // the transform exists to add.
      allowedAttributes: { a: ['href', 'title', 'rel', 'target'] },
      // `javascript:` and `data:` URLs are how an anchor becomes script execution.
      allowedSchemes: ['http', 'https', 'mailto'],
      allowedSchemesAppliedToAttributes: ['href'],
      // A link that leaves the app must not hand the opener a handle on our window.
      transformTags: {
        a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
      },
      // Text inside a stripped tag is kept; the markup goes, the words stay.
      disallowedTagsMode: 'discard',
      enforceHtmlBoundary: true,
    });
  }
}
