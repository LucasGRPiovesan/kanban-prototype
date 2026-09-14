import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

/**
 * Index-numbered paging over an offset-paginated list — the Anterior/Próxima pair alone
 * tells someone how to move, never where they are or how far the record goes.
 *
 * `pageCount` is the *true* total the server computed from a `count()` alongside the
 * page itself, so every page number is visible and directly reachable from the first
 * render — including one never visited — not just pages walked so far. `onGoTo` issues
 * exactly one request for the page asked for, the same as `onNext`/`onPrevious`.
 */
export function Pagination({
  pageIndex,
  pageCount,
  hasNextPage,
  disabled = false,
  onGoTo,
  onPrevious,
  onNext,
}: {
  /** Zero-based index of the page currently shown. */
  pageIndex: number;
  /** True total page count, known from the server's own `count()`. */
  pageCount: number;
  hasNextPage: boolean;
  disabled?: boolean;
  /** Jump straight to any page — one direct request, not a walk through the pages between. */
  onGoTo: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const numbers = pageNumbers(pageIndex, pageCount);

  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center gap-1">
      <Button
        variant="secondary"
        size="sm"
        icon={<ChevronLeft className="h-4 w-4" />}
        disabled={disabled || pageIndex === 0}
        onClick={onPrevious}
      >
        Anterior
      </Button>

      <ul className="flex items-center gap-1">
        {numbers.map((entry, index) =>
          entry === 'ellipsis' ? (
            <li key={`ellipsis-${index}`} className="px-1 text-xs text-subtle" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={entry}>
              <button
                type="button"
                disabled={disabled}
                aria-current={entry === pageIndex ? 'page' : undefined}
                onClick={() => onGoTo(entry)}
                className={cn(
                  'flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold tabular-nums transition-colors duration-150',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  entry === pageIndex
                    ? 'bg-brand-400 text-on-brand'
                    : 'text-muted hover:bg-surface-muted hover:text-body',
                )}
              >
                {entry + 1}
              </button>
            </li>
          ),
        )}
      </ul>

      <Button
        variant="secondary"
        size="sm"
        icon={<ChevronRight className="h-4 w-4" />}
        disabled={disabled || (!hasNextPage && pageIndex >= pageCount - 1)}
        onClick={onNext}
      >
        Próxima
      </Button>
    </nav>
  );
}

/**
 * First page, last known page, and a window of three around the current one — with an
 * ellipsis wherever the run breaks. Keeps the control from turning into forty buttons on
 * a long history without hiding where "the start" and "as far as we've gone" are.
 */
function pageNumbers(current: number, count: number): (number | 'ellipsis')[] {
  const keep = new Set<number>([0, count - 1, current - 1, current, current + 1]);
  const sorted = [...keep].filter((page) => page >= 0 && page < count).sort((a, b) => a - b);

  const result: (number | 'ellipsis')[] = [];
  let previous: number | null = null;
  for (const page of sorted) {
    if (previous !== null && page - previous > 1) {
      result.push('ellipsis');
    }
    result.push(page);
    previous = page;
  }
  return result;
}
