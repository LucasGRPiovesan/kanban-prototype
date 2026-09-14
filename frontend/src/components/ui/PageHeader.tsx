import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * Page heading with the breadcrumb trail from the reference ("Home › Demandas › Novo").
 * The last crumb is the current page and is not a link.
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
  return (
    <div className="space-y-3">
      {crumbs.length > 0 && (
        <nav aria-label="Trilha de navegação">
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
      )}

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
    <div className={`mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8 ${wide ? '' : 'max-w-5xl'}`}>
      {children}
    </div>
  );
}
