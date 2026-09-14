import { cn } from '@/lib/cn';

/** Placeholder that mirrors the shape of the content it is standing in for. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-md', className)} aria-hidden="true" />;
}

export function SkeletonCard() {
  return (
    <div className="card-surface space-y-3 p-3.5 shadow-card">
      <Skeleton className="h-4 w-3/4" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-full" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
    </div>
  );
}

/**
 * Empty states are directions, not decoration: each one names what is missing and,
 * when the user is allowed to fix it, offers the action that does so.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex animate-rise-in flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
      )}
    >
      <div
        className={cn(
          'flex animate-pop-in items-center justify-center rounded-full bg-surface-muted text-subtle',
          compact ? 'h-10 w-10' : 'h-14 w-14',
        )}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="space-y-1">
        <p className={cn('font-semibold text-body', compact ? 'text-sm' : 'text-base')}>{title}</p>
        {description && (
          <p className={cn('mx-auto max-w-sm text-muted', compact ? 'text-xs' : 'text-sm')}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

/** Errors say what happened and what to do next, in the interface's own voice. */
export function ErrorState({
  title = 'Não foi possível carregar',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex animate-rise-in flex-col items-center gap-3 rounded-xl border border-danger-border bg-danger-surface px-6 py-10 text-center"
    >
      <p className="text-base font-semibold text-body">{title}</p>
      {message && <p className="max-w-sm text-sm text-muted">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="press rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-body transition-all duration-200 ease-smooth hover:border-line-strong hover:bg-surface-muted"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
