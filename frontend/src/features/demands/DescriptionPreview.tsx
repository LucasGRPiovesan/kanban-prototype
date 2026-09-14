import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { AlignLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

const PREVIEW_MAX_LENGTH = 240;

/** DOMPurify strips tags but leaves an entity like `&nbsp;` as literal text, not a space. */
const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/**
 * Rich-text markup, reduced to the words it says — the same measure `RichText` on the
 * server bases its length rule on. `ALLOWED_TAGS: []` makes DOMPurify return text content
 * only, so there is no second, hand-rolled tag-stripping regex to keep in sync with the
 * server's own `toPlainText`.
 */
function toPlainPreview(html: string): string {
  const stripped = DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
  const decoded = stripped.replace(
    /&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g,
    (entity) => ENTITIES[entity] ?? entity,
  );
  const text = decoded.replace(/\s+/g, ' ').trim();
  if (text.length <= PREVIEW_MAX_LENGTH) {
    return text;
  }
  return `${text.slice(0, PREVIEW_MAX_LENGTH).trimEnd()}…`;
}

/**
 * A description icon that floats a plain-text preview on hover — the list's answer to
 * "what is this actually about" without opening the card.
 *
 * Built like `Tooltip`, not on top of it: a preview is multi-line and needs real width,
 * while `Tooltip` is deliberately a single `white-space: nowrap` line for short labels.
 * Portaled for the same reason every floating element here is — a list row lives inside
 * a scroll container that would clip an absolutely positioned box.
 */
export function DescriptionPreview({ html, className }: { html: string; className?: string }) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const preview = useMemo(() => toPlainPreview(html), [html]);

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    setPosition({ left: rect.left + rect.width / 2, top: rect.top - 8 });
  }, []);

  const show = () => measure();
  const hide = () => setPosition(null);

  useLayoutEffect(() => {
    if (!position) {
      return;
    }
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [position, measure]);

  if (!preview) {
    return null;
  }

  return (
    <span
      ref={anchorRef}
      className={cn('inline-flex shrink-0', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={position ? id : undefined}
    >
      <AlignLeft
        className="h-3.5 w-3.5 text-subtle transition-colors duration-150 hover:text-body"
        aria-label={`Descrição: ${preview}`}
        tabIndex={0}
      />

      {position &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={{ position: 'fixed', left: position.left, top: position.top }}
            className={cn(
              'pointer-events-none z-[80] block w-64 -translate-x-1/2 -translate-y-full animate-fade-in',
              'whitespace-pre-line rounded-lg bg-body px-3 py-2 text-left text-2xs leading-relaxed text-canvas shadow-lifted',
            )}
          >
            {preview}
          </span>,
          document.body,
        )}
    </span>
  );
}
