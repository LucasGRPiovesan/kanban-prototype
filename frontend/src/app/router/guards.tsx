import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { FullPageLoader } from '@/components/ui/FullPageLoader';
import type { PermissionCode } from '@/lib/api/types';

/**
 * Conditional rendering by permission.
 *
 * This is UX, not security: hiding a button the user cannot use keeps the interface
 * honest about what is available. The backend refuses the same action independently,
 * so bypassing this component in devtools gains nothing.
 */
export function PermissionGate({
  permission,
  permissions,
  mode = 'every',
  fallback = null,
  children,
}: {
  permission?: PermissionCode;
  permissions?: PermissionCode[];
  mode?: 'every' | 'some';
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { canEvery, canSome } = useAuth();
  const required = permission ? [permission] : (permissions ?? []);

  if (required.length === 0) {
    return <>{children}</>;
  }
  const allowed = mode === 'every' ? canEvery(required) : canSome(required);
  return <>{allowed ? children : fallback}</>;
}

/** Requires an authenticated session; sends anonymous visitors to the login screen. */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageLoader label="Carregando sua sessão" />;
  }
  if (!session) {
    // No `from` to remember: signing in always lands on the home screen, never back
    // on whatever page a stale or ended session happened to be on.
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/**
 * Route-level module guard. A user without a module's ACCESS permission has neither a
 * menu entry nor a reachable URL for it — typing the path lands on the home screen
 * rather than on a page that would only render errors.
 */
export function ModuleAccessGuard({
  permissions,
  children,
}: {
  permissions: PermissionCode[];
  children: React.ReactNode;
}) {
  const { canEvery } = useAuth();
  if (!canEvery(permissions)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
