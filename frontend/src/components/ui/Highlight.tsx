import { Fragment } from 'react';
import { matchSegments } from '@/lib/textMatch';

/**
 * Marks up the part of `text` that matched a search term — the "marca texto" the Kanban
 * search wants: proof, right on the card, of *what* matched and not only *that* it did.
 *
 * A plain `<mark>` per matched run rather than the browser's own find-in-page styling, so
 * it reads consistently across themes and never collides with an actual text selection.
 * Renders `text` untouched (no `<mark>`, no extra wrapper) when `term` is empty — the
 * common case, so a card with no active search costs nothing beyond this one component.
 */
export function Highlight({ text, term }: { text: string; term: string }) {
  if (!term.trim()) {
    return <>{text}</>;
  }
  return (
    <>
      {matchSegments(text, term).map((segment, index) =>
        segment.matched ? (
          // `bg-brand-300` / `text-on-brand` are both fixed values, the same in light and
          // dark mode (see index.css) — a `dark:` variant would miss the "no explicit
          // choice, OS prefers dark" case, which this app's theme only ever flips via the
          // `[data-theme]` attribute or a media query, never a `.dark` class.
          <mark key={index} className="rounded-[0.2em] bg-brand-300 px-0.5 py-px text-on-brand">
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}
