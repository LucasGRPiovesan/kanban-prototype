import { createContext, useContext, useState } from 'react';

export interface Crumb {
  label: string;
  to?: string;
}

interface BreadcrumbContextValue {
  crumbs: Crumb[];
  setCrumbs: (crumbs: Crumb[]) => void;
}

// A no-op default rather than a required provider: plenty of component tests render a
// single page (which calls `PageHeader`, hence this hook) without the whole app shell
// around it, and a missing trail should just mean nothing is shown, not a crash.
const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  crumbs: [],
  setCrumbs: () => {},
});

/**
 * Holds whichever page's breadcrumb trail is current, so the trail can be rendered once
 * in the Topbar — next to the sidebar's own collapse control — instead of repeated
 * inside every screen's own header. `PageHeader` is still where a page declares its
 * trail; it just hands it up here instead of drawing it itself.
 */
export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  return (
    <BreadcrumbContext.Provider value={{ crumbs, setCrumbs }}>{children}</BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbs(): BreadcrumbContextValue {
  return useContext(BreadcrumbContext);
}
