import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useAuth } from '@/app/providers/AuthProvider';
import { demandsApi, notificationsApi } from '@/lib/api/endpoints';
import type { NotificationPage } from '@/lib/api/types';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (unreadOnly: boolean) => ['notifications', 'list', unreadOnly ? 'unread' : 'all'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  watching: ['notifications', 'watching'] as const,
};

const PAGE_SIZE = 15;

export function useNotificationList(unreadOnly: boolean, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(unreadOnly),
    queryFn: ({ pageParam }) =>
      notificationsApi.list({ unreadOnly, limit: PAGE_SIZE, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

/**
 * The badge count. Polls slowly as a safety net only — the event stream keeps it current
 * the moment something arrives; the poll covers a stream that silently dropped.
 */
export function useUnreadNotificationCount() {
  const { session } = useAuth();
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: notificationsApi.unreadCount,
    select: (data) => data.unreadCount,
    enabled: Boolean(session),
    refetchInterval: 120_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (uuids: string[]) => notificationsApi.markRead(uuids),
    onMutate: (uuids) => {
      // Seen is instant on screen: the dot disappears on click, not after a round trip.
      const readAt = new Date().toISOString();
      const unread = new Set(uuids);
      queryClient.setQueriesData<InfiniteData<NotificationPage>>(
        { queryKey: [...notificationKeys.all, 'list'] },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                unread.has(item.uuid) && !item.readAt ? { ...item, readAt } : item,
              ),
            })),
          },
      );
    },
    onSuccess: ({ unreadCount }) => {
      queryClient.setQueryData(notificationKeys.unreadCount, { unreadCount });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...notificationKeys.all, 'list'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      queryClient.setQueryData(notificationKeys.unreadCount, { unreadCount: 0 });
      void queryClient.invalidateQueries({ queryKey: [...notificationKeys.all, 'list'] });
    },
  });
}

/** The set of demands this person follows. Empty — and never fetched — without DEMAND_WATCH. */
export function useWatchedDemands() {
  const { can } = useAuth();
  const enabled = can('DEMAND_WATCH');
  const query = useQuery({
    queryKey: notificationKeys.watching,
    queryFn: demandsApi.watching,
    select: (data) => new Set(data.demandUuids),
    enabled,
    staleTime: 60_000,
  });
  return { enabled, watching: query.data ?? EMPTY };
}

const EMPTY: ReadonlySet<string> = new Set();

export function useToggleDemandWatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ demandUuid, watching }: { demandUuid: string; watching: boolean }) =>
      watching ? demandsApi.watch(demandUuid) : demandsApi.unwatch(demandUuid),
    onMutate: async ({ demandUuid, watching }) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.watching });
      const previous = queryClient.getQueryData<{ demandUuids: string[] }>(
        notificationKeys.watching,
      );
      const current = new Set(previous?.demandUuids ?? []);
      if (watching) {
        current.add(demandUuid);
      } else {
        current.delete(demandUuid);
      }
      queryClient.setQueryData(notificationKeys.watching, { demandUuids: [...current] });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(notificationKeys.watching, context?.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.watching }),
  });
}
