import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/client';

/**
 * Shared query defaults.
 *
 * Authorization failures are never retried: a 401 or 403 is a settled answer from the
 * server, and repeating the request only delays the UI's response to it.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (
            error instanceof ApiError &&
            (error.isUnauthorized || error.isForbidden || error.status === 404)
          ) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
