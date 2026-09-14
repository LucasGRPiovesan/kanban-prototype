import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { ApiError, onUnauthorized } from '@/lib/api/client';
import { authApi } from '@/lib/api/endpoints';
import type { PermissionCode, Session } from '@/lib/api/types';

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  login: (userUuid: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Mirrors the backend's effective-permission check for UX purposes only. */
  can: (permission: PermissionCode) => boolean;
  canEvery: (permissions: PermissionCode[]) => boolean;
  canSome: (permissions: PermissionCode[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session state, owned by TanStack Query rather than a hand-rolled effect.
 *
 * `/auth/me` is the source of truth: the permission list is re-fetched from the server
 * rather than decoded from the token, so a role edited by an administrator changes what
 * this user sees on the next fetch. The frontend uses it purely to decide what to show
 * — the API independently enforces the same rules on every call.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['session'],
    queryFn: authApi.me,
    retry: (failureCount, error) => {
      // A 401 simply means "not logged in" — retrying it just delays the login screen.
      if (error instanceof ApiError && error.isUnauthorized) {
        return false;
      }
      return failureCount < 2;
    },
    staleTime: 30_000,
  });

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (session) => {
      queryClient.setQueryData(['session'], session);
    },
  });

  const login = useCallback(
    async (userUuid: string) => {
      await loginMutation.mutateAsync(userUuid);
    },
    [loginMutation],
  );

  /**
   * Drop the session without ever destroying the query this provider observes.
   *
   * `queryClient.clear()` looks like the obvious way to wipe the cache, but it removes
   * the query object itself. A mounted observer keeps serving its last result and is not
   * re-subscribed by a later `setQueryData`, so the UI would go on believing the previous
   * user was still signed in while every other request began failing with 401.
   *
   * The order therefore matters: settle the live session query to `null` first, then
   * remove the *other* cached queries so no data outlives the session boundary.
   */
  const clearSession = useCallback(() => {
    queryClient.setQueryData(['session'], null);
    void queryClient.cancelQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
  }, [queryClient]);

  /**
   * Never rejects.
   *
   * Callers navigate to the login screen once this resolves, so a rejected promise
   * would abandon the user on the current page with the session already gone. There is
   * nothing actionable about a failed logout call either: the local session ends
   * regardless, because leaving someone inside the application shell holding a cookie
   * the server may already have rejected is the worse outcome.
   */
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Reported by the transport's own logging; the sign-out proceeds either way.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  /**
   * A session can also end on its own, when the cookie expires mid-use. Any 401 from any
   * endpoint is the server saying so, and the app returns to the login screen instead of
   * showing "não foi possível carregar" on every panel.
   */
  useEffect(() => onUnauthorized(clearSession), [clearSession]);

  const session = data ?? null;

  const value = useMemo<AuthContextValue>(() => {
    const granted = new Set(session?.permissions ?? []);
    return {
      session,
      isLoading,
      login,
      logout,
      can: (permission) => granted.has(permission),
      canEvery: (permissions) => permissions.every((p) => granted.has(p)),
      canSome: (permissions) => permissions.some((p) => granted.has(p)),
    };
  }, [session, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }
  return context;
}
