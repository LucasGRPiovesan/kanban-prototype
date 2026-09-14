import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

/**
 * A hint attached to something already visible.
 *
 * Rendered in a portal for the same reason the select's listbox is: a Kanban column
 * scrolls, and an absolutely positioned bubble would be clipped by it — worst at the top
 * and bottom of the column, which is exactly where cards sit.
 *
 * The tooltip is supplementary, never the only source of the information: every trigger
 * also carries an accessible name, so a screen reader gets the meaning without depending
 * on hover at all. This exists for the sighted user who wants to know what a small icon
 * counts.
 */
export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; below: boolean } | null>(
    null,
  );

  /** Rough allowance for the bubble's own height plus its gap from the anchor. */
  const ESTIMATED_HEIGHT = 32;

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    // Above is the default, but an anchor near the top of the viewport — the topbar's
    // own icons — has nowhere to put it: flipped below, the same way the status
    // dropdown flips when the panel below it would run past the screen.
    const below = rect.top < ESTIMATED_HEIGHT;
    setPosition({
      left: rect.left + rect.width / 2,
      top: below ? rect.bottom + 8 : rect.top - 8,
      below,
    });
  }, []);

  const show = () => measure();
  const hide = () => setPosition(null);

  useLayoutEffect(() => {
    if (!position) {
      return;
    }
    // Any scroll moves the anchor; the bubble follows or disappears rather than
    // floating over unrelated content.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [position, measure]);

  return (
    <>
      <span
        ref={anchorRef}
        className={cn('inline-flex', className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={position ? id : undefined}
      >
        {children}
      </span>

      {position &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={{ position: 'fixed', left: position.left, top: position.top }}
            className={cn(
              'pointer-events-none z-[80] -translate-x-1/2 animate-fade-in whitespace-nowrap rounded-md',
              'bg-body px-2 py-1 text-2xs font-semibold text-canvas shadow-lifted',
              position.below ? 'translate-y-0' : '-translate-y-full',
            )}
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
