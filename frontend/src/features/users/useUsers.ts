import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/lib/api/endpoints';

export const userKeys = {
  all: ['users'] as const,
  detail: (uuid: string) => ['users', 'detail', uuid] as const,
  history: (uuid: string) => ['users', 'detail', uuid, 'history'] as const,
};

export function useUser(uuid: string | null) {
  return useQuery({
    queryKey: userKeys.detail(uuid ?? ''),
    queryFn: () => usersApi.get(uuid!),
    enabled: Boolean(uuid),
  });
}

export function useUserHistory(uuid: string | null) {
  return useInfiniteQuery({
    queryKey: userKeys.history(uuid ?? ''),
    queryFn: ({ pageParam }) => usersApi.history(uuid!, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: Boolean(uuid),
  });
}

/**
 * Profile-screen edits — name, perfil, situação — invalidating both the detail the panel
 * shows and the paged table underneath it, the same "every write refreshes both readings"
 * rule the demand details panel follows.
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      uuid,
      input,
    }: {
      uuid: string;
      input: { name?: string; roleUuid?: string; active?: boolean };
    }) => usersApi.update(uuid, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.uuid) });
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
}

/** Undoes a soft delete. Invalidated the same way an edit is — detail, table, session. */
export function useRestoreUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (uuid: string) => usersApi.restore(uuid),
    onSuccess: (_data, uuid) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.detail(uuid) });
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

/**
 * Soft-deletes a user and, per the caller's choice, either deletes or archives every
 * demand they were responsible for — so every screen that shows a count of those
 * (the Usuários table, the Kanban board, the Demandas history) has to hear about it.
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uuid, demandAction }: { uuid: string; demandAction: 'delete' | 'archive' }) =>
      usersApi.remove(uuid, demandAction),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      void queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.uuid) });
      void queryClient.invalidateQueries({ queryKey: ['demands'] });
    },
  });
}
