import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/cn';

/** Mirrors the server's allowlist. Two independent gates, not one gate written twice. */
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

/**
 * Renders a demand's description.
 *
 * The API sanitizes on the way in, so why sanitize again here? Because the two checks
 * defend different things. The server protects what gets *stored*; this protects what
 * gets *executed in this browser*, and it is the only one still standing if a row
 * predates the current allowlist. `dangerouslySetInnerHTML` earns exactly one line of
 * scrutiny, and this is it.
 *
 * Every stored description is markup — a migration converted the plain-text rows that
 * predate rich text. That matters: an earlier version of this component guessed whether
 * a value "looked like HTML", and a plain description containing `<` lost everything
 * after it, because a sanitizer cannot tell "a < b" from a malformed tag. Converting the
 * data once removed the need to guess at all.
 */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
        // Blocks `javascript:` and friends without having to enumerate them.
        ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
      }),
    [html],
  );

  return (
    <div
      className={cn('prose-demand', className)}
      // Sanitized immediately above, against an allowlist that matches the server's.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
