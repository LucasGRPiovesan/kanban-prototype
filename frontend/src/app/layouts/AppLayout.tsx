import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  FolderKanban,
  Kanban,
  LayoutDashboard,
  LayoutList,
  LogOut,
  type LucideIcon,
  Menu,
  Moon,
  PanelLeft,
  Plug,
  ScrollText,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { BreadcrumbProvider, useBreadcrumbs } from '@/app/providers/BreadcrumbProvider';
import { useTheme } from '@/app/providers/ThemeProvider';
import { Avatar } from '@/components/ui/Avatar';
import { DefaultBrandMark } from '@/components/brand/DefaultBrandMark';
import { useBrandingQuery } from '@/features/branding/useBranding';
import { FullPageLoader } from '@/components/ui/FullPageLoader';
import { IconButton } from '@/components/ui/Button';
import { EnhancementBadge } from '@/components/ui/EnhancementBadge';
import { Breadcrumbs } from '@/components/ui/PageHeader';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { useNotificationStream } from '@/features/notifications/useNotificationStream';
import type { PermissionCode } from '@/lib/api/types';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Module ACCESS permission. Without it the item is absent and the route is closed. */
  permissions: PermissionCode[];
  /** On top of `permissions`: at least one of these — the Dashboard needs some indicator scope. */
  anyOf?: PermissionCode[];
  /**
   * Beyond the original specification. Mirrors the modules listed in
   * docs/ADDED_REQUIREMENTS.md — the Kanban, user registration and demand registration
   * are the brief itself; the rest were added. "Melhoria" for a module that was actually
   * built; "Sugestão" for one offered as a proposal rather than a firm requirement.
   */
  badge?: 'Melhoria' | 'Sugestão';
}

/**
 * Navigation is derived from permissions, not hard-coded per role.
 *
 * Icons are chosen for meaning rather than looks: a Kanban glyph for the board, a
 * folder-kanban for projects, a shield for profiles, people for users, a scroll for the
 * record of what happened.
 *
 * Order: Kanban, Demandas and Usuários first — the brief's own core flow — then
 * everything else in the order it was added.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/kanban', label: 'Kanban', icon: Kanban, permissions: ['DEMAND_ACCESS', 'DEMAND_KANBAN'] },
  {
    to: '/demandas',
    label: 'Demandas',
    icon: LayoutList,
    permissions: ['DEMAND_ACCESS', 'DEMAND_LIST'],
  },
  { to: '/usuarios', label: 'Usuários', icon: Users, permissions: ['USER_ACCESS'] },
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    permissions: ['DEMAND_ACCESS', 'DASHBOARD_ACCESS'],
    anyOf: ['DASHBOARD_VIEW_OWN', 'DASHBOARD_VIEW_ALL'],
    badge: 'Melhoria',
  },
  {
    to: '/projetos',
    label: 'Projetos',
    icon: FolderKanban,
    permissions: ['PROJECT_ACCESS'],
    badge: 'Melhoria',
  },
  {
    to: '/perfis',
    label: 'Perfis',
    icon: ShieldCheck,
    permissions: ['ROLE_ACCESS'],
    badge: 'Melhoria',
  },
  { to: '/logs', label: 'Logs', icon: ScrollText, permissions: ['LOG_ACCESS'], badge: 'Melhoria' },
  {
    to: '/integracao',
    label: 'Integração',
    icon: Plug,
    // The API documentation; generating a project's own credentials is gated separately,
    // on the Projects screen, by PROJECT_MANAGE_INTEGRATION.
    permissions: ['INTEGRATION_ACCESS'],
    badge: 'Sugestão',
  },
  {
    to: '/documentacao',
    label: 'Documentação',
    icon: BookOpen,
    permissions: ['DOCS_ACCESS'],
  },
];

/** Whether the desktop sidebar is collapsed to an icon rail. Survives a reload. */
const COLLAPSE_KEY = 'csp.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    // Private browsing or a blocked storage: default to expanded, same as a first visit.
    return false;
  }
}

export function AppLayout() {
  const { session, logout, canEvery, canSome } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // One live connection for the whole shell, so every screen hears about new notifications.
  useNotificationStream();

  // Navigating on a phone should dismiss the drawer, not leave it covering the page.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      // Nothing to persist to; the toggle still works for the rest of the session.
    }
  }, [collapsed]);

  const visibleItems = NAV_ITEMS.filter(
    (item) => canEvery(item.permissions) && (!item.anyOf || canSome(item.anyOf)),
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <BreadcrumbProvider>
      <div className="flex h-screen overflow-hidden bg-canvas">
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 animate-fade-in bg-black/50 backdrop-blur-[2px] lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        <Sidebar
          items={visibleItems}
          open={mobileOpen}
          collapsed={collapsed}
          onClose={() => setMobileOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((current) => !current)}
            onOpenMobileMenu={() => setMobileOpen(true)}
            userName={session?.user.name ?? ''}
            userAvatarUrl={session?.user.avatarUrl ?? null}
            roleName={session?.role.name ?? ''}
            onLogout={handleLogout}
          />
          {/*
            Keying on the path replays the entrance animation on every navigation, so
            moving between screens reads as a transition rather than an instant swap.
          */}
          <main
            key={location.pathname}
            className="scroll-slim min-h-0 w-full min-w-0 flex-1 animate-rise-in overflow-y-auto"
          >
            {/* Screens are lazy-loaded chunks (see AppRouter): the shell stays put while one loads. */}
            <Suspense fallback={<FullPageLoader />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
}

function Sidebar({
  items,
  open,
  collapsed,
  onClose,
}: {
  items: NavItem[];
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
}) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar',
        'transition-[transform,width] duration-300 ease-smooth',
        'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
        collapsed ? 'lg:w-[4.5rem]' : 'lg:w-[16.5rem]',
        'w-[16.5rem]',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/*
        The dot field gives the flat lime panel some texture at close range without
        adding a second colour or an image asset. It fades out before the navigation
        so it never competes with the labels.
      */}
      <div
        className="dot-field pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]"
        aria-hidden="true"
      />

      <div
        className={cn(
          'relative flex items-center pb-8 pt-8',
          collapsed ? 'justify-center px-3 lg:px-0' : 'justify-between px-6 lg:justify-center',
        )}
      >
        <div className={cn(collapsed && 'lg:hidden')}>
          <BrandMark />
        </div>
        {collapsed && (
          <span className="hidden lg:block" aria-hidden="true">
            <BrandMark size="sm" />
          </span>
        )}
        <IconButton
          label="Fechar menu"
          icon={<X className="h-4 w-4" />}
          onClick={onClose}
          className="text-sidebar-text hover:bg-sidebar-hover lg:hidden"
        />
      </div>

      <nav
        aria-label="Navegação principal"
        className="scroll-slim relative flex-1 overflow-y-auto px-3"
      >
        <ul className="stagger space-y-1">
          {items.map((item, index) => (
            <li key={item.to} style={{ '--i': index } as React.CSSProperties}>
              <SidebarLink item={item} collapsed={collapsed} />
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const link = (
    <NavLink
      to={item.to}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5',
          'text-sm font-semibold transition-all duration-200 ease-smooth',
          collapsed && 'lg:justify-center',
          isActive
            ? 'bg-sidebar-active-bg text-sidebar-active-text shadow-card'
            : 'text-sidebar-text hover:translate-x-0.5 hover:bg-sidebar-hover hover:text-sidebar-hover-text',
          collapsed && 'lg:hover:translate-x-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/*
            A marker on the leading edge of the current item. It grows into place
            rather than appearing, which makes the jump between two menu entries
            legible instead of instantaneous.
          */}
          <span
            className={cn(
              'absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand-600 transition-transform duration-200 ease-spring',
              isActive ? 'scale-y-100' : 'scale-y-0',
            )}
            aria-hidden="true"
          />
          <item.icon
            className={cn(
              'h-[1.15rem] w-[1.15rem] shrink-0 transition-transform duration-200 ease-smooth',
              isActive ? 'scale-110' : 'opacity-80 group-hover:scale-110',
            )}
            aria-hidden="true"
          />
          <span className={cn('min-w-0 flex-1 truncate', collapsed && 'lg:hidden')}>
            {item.label}
          </span>
          {item.badge && (
            <span className={cn(collapsed && 'lg:hidden')}>
              <EnhancementBadge label={item.badge} size="xs" />
            </span>
          )}
        </>
      )}
    </NavLink>
  );

  // The label collapses away on desktop, so the icon alone needs a way to still say
  // what it does — a tooltip is that, without permanently widening the rail back out.
  if (!collapsed) {
    return link;
  }
  return (
    <Tooltip label={item.label} className="w-full">
      {link}
    </Tooltip>
  );
}

/**
 * The app-wide header, always on screen next to the sidebar.
 *
 * Holds what used to sit at the foot of the sidebar — the signed-in person, the theme
 * switch, sign out — plus the sidebar's own collapse control at its leading edge, right
 * where the sidebar itself is. Page-specific toolbars (the Kanban's search and filters,
 * for instance) stay inside their own screen; this bar is the one constant across every
 * screen in the shell.
 */
function Topbar({
  collapsed,
  onToggleCollapse,
  onOpenMobileMenu,
  userName,
  userAvatarUrl,
  roleName,
  onLogout,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobileMenu: () => void;
  userName: string;
  userAvatarUrl: string | null;
  roleName: string;
  onLogout: () => void;
}) {
  const { resolved, toggle } = useTheme();
  const { crumbs } = useBreadcrumbs();

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-md sm:px-6">
      <IconButton
        label="Abrir menu"
        icon={<Menu className="h-5 w-5" />}
        onClick={onOpenMobileMenu}
        className="lg:hidden"
      />
      <BrandMark size="sm" className="lg:hidden" />

      <Tooltip label={collapsed ? 'Expandir menu' : 'Recolher menu'} className="hidden lg:block">
        <IconButton
          label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          icon={<PanelLeft className="h-[1.15rem] w-[1.15rem]" />}
          onClick={onToggleCollapse}
        />
      </Tooltip>

      <Breadcrumbs crumbs={crumbs} className="hidden min-w-0 lg:block" />

      <div className="min-w-0 flex-1" />

      <NotificationBell />

      <Tooltip label={resolved === 'dark' ? 'Tema claro' : 'Tema escuro'}>
        <IconButton
          label={resolved === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
          onClick={toggle}
          icon={
            // The two glyphs cross-fade in place: the control keeps its position and
            // only its meaning changes, which is exactly what the toggle does.
            <span className="relative block h-[1.15rem] w-[1.15rem]">
              <Sun
                className={cn(
                  'absolute inset-0 h-[1.15rem] w-[1.15rem] transition-all duration-300 ease-smooth',
                  resolved === 'dark'
                    ? 'rotate-0 scale-100 opacity-100'
                    : '-rotate-90 scale-50 opacity-0',
                )}
                aria-hidden="true"
              />
              <Moon
                className={cn(
                  'absolute inset-0 h-[1.15rem] w-[1.15rem] transition-all duration-300 ease-smooth',
                  resolved === 'dark'
                    ? 'rotate-90 scale-50 opacity-0'
                    : 'rotate-0 scale-100 opacity-100',
                )}
                aria-hidden="true"
              />
            </span>
          }
        />
      </Tooltip>

      {/*
        The identity control doubles as the entry point to self-service profile
        editing — the same "click your own name to manage your account" pattern most
        signed-in products use, so it needs no separate menu entry to be found.
      */}
      <Link
        to="/perfil"
        className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors duration-150 hover:bg-surface-muted"
      >
        <Avatar name={userName} src={userAvatarUrl} size="sm" />
        <span className="hidden text-left sm:block">
          <span className="block truncate text-sm font-semibold leading-tight text-body">
            {userName}
          </span>
          {roleName && (
            <span className="block truncate text-xs leading-tight text-muted">{roleName}</span>
          )}
        </span>
      </Link>

      <Tooltip label="Sair">
        <IconButton
          label="Sair"
          icon={<LogOut className="h-[1.15rem] w-[1.15rem]" />}
          onClick={onLogout}
        />
      </Tooltip>
    </header>
  );
}

/**
 * The product's actual wordmark, not a typeset approximation of it.
 *
 * Every surface it sits on flips between a bright and a near-black background with the
 * theme — the sidebar's lime, the login panel that shares that same background, the
 * mobile topbar's plain surface — so one logo reads and the other disappears depending
 * on which theme is active. `logo-light.png` (dark type) is the one for a light
 * surface; `logo-black.png` (white type) is the one for a dark one, so the choice
 * follows the resolved theme rather than which spot in the layout is asking.
 */
const BRAND_MARK_SIZES = {
  // The rail icon and the mobile topbar — small, next to other controls.
  sm: 'h-5',
  // The expanded sidebar header — the size this component was born at.
  md: 'h-14',
  // The login screen's hero panel: full-width, nothing beside it competing for
  // attention, so the wordmark can lead at a size that actually reads as a brand.
  lg: 'h-24',
} as const;

export function BrandMark({
  size = 'md',
  className,
}: {
  size?: keyof typeof BRAND_MARK_SIZES;
  className?: string;
}) {
  const { resolved } = useTheme();
  const { data: branding } = useBrandingQuery();
  const customUrl = resolved === 'dark' ? branding?.logoDarkUrl : branding?.logoLightUrl;

  if (customUrl) {
    return (
      <img
        src={customUrl}
        alt="Kanban"
        className={cn(BRAND_MARK_SIZES[size], 'w-auto object-contain', className)}
      />
    );
  }
  return (
    <DefaultBrandMark className={cn(BRAND_MARK_SIZES[size], 'w-auto text-body', className)} />
  );
}
