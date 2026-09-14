import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { type Crumb, useBreadcrumbs } from '@/app/providers/BreadcrumbProvider';
import { cn } from '@/lib/cn';

export type { Crumb };

/**
 * The breadcrumb trail itself — pulled out so both `PageHeader` (which only ever hands
 * its `crumbs` up to the Topbar) and the Topbar (which actually draws them, next to the
 * sidebar's collapse control) share one rendering.
 */
export function Breadcrumbs({ crumbs, className }: { crumbs: Crumb[]; className?: string }) {
  if (crumbs.length === 0) {
    return null;
  }
  return (
    <nav aria-label="Trilha de navegação" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-xs font-medium text-subtle">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {crumb.to && !isLast ? (
                <Link to={crumb.to} className="rounded transition-colors hover:text-body">
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={isLast ? 'text-muted' : undefined}
                >
                  {crumb.label}
                </span>
              )}
              {!isLast && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Page heading, in the shape from the reference. The breadcrumb trail itself no longer
 * lives here — `crumbs` is handed up to the Topbar (see `Breadcrumbs` above), which sits
 * next to the sidebar's collapse control and is the one place the trail is drawn.
 */
export function PageHeader({
  title,
  description,
  crumbs = [],
  actions,
  badge,
}: {
  title: string;
  /** Rendered beside the title — e.g. the "Melhoria" mark on modules added to the brief. */
  badge?: React.ReactNode;
  description?: string;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
}) {
  const { setCrumbs } = useBreadcrumbs();
  // Crumb arrays are usually written inline at the call site, so a new array arrives on
  // every render — a joined key of their actual content is what should decide whether
  // the Topbar's trail needs updating, not the array's identity.
  const crumbKey = crumbs.map((crumb) => `${crumb.label}|${crumb.to ?? ''}`).join('>');

  useEffect(() => {
    setCrumbs(crumbs);
    // Leaving the page clears its trail rather than leaving a stale one showing while
    // the next page's own PageHeader has not yet mounted to replace it.
    return () => setCrumbs([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crumbKey]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xl font-bold text-body">
            {title}
            {badge}
          </h1>
          {description && <p className="max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Standard page padding, so every screen shares the same rhythm and max width. */
export function PageShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn('mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8', !wide && 'max-w-5xl')}>
      {children}
    </div>
  );
}
