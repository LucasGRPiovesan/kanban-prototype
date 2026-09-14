import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { demandsApi } from '@/lib/api/endpoints';
import type { DemandComment } from '@/lib/api/types';
import { demandKeys } from '@/features/kanban/useDemands';

export const demandActivityKeys = {
  comments: (uuid: string) => ['demands', 'comments', uuid] as const,
  /**
   * Nested under the demand's detail key on purpose: every write that invalidates the
   * demand — an edit, a move, a checklist tick — refreshes its history with it, so the
   * "Atualizações" tab never lags behind the change the user just made.
   */
  history: (uuid: string) => [...demandKeys.detail(uuid), 'history'] as const,
};

export function useDemandComments(demandUuid: string | null) {
  return useQuery({
    queryKey: demandActivityKeys.comments(demandUuid ?? ''),
    queryFn: () => demandsApi.comments(demandUuid!),
    enabled: Boolean(demandUuid),
    staleTime: 10_000,
  });
}

/**
 * Comment writes. Authorship is the server's decision; these only keep the list in step.
 *
 * Removal is optimistic — the confirmation dialog has already asked — and restored if the
 * server refuses. Adding and editing wait for the response: the server trims and
 * validates the body, and showing text it then rejects would be a lie for a moment.
 */
export function useCommentMutations(demandUuid: string) {
  const queryClient = useQueryClient();
  const key = demandActivityKeys.comments(demandUuid);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: (body: string) => demandsApi.addComment(demandUuid, body),
    onSuccess: invalidate,
  });

  const edit = useMutation({
    mutationFn: ({ commentUuid, body }: { commentUuid: string; body: string }) =>
      demandsApi.editComment(demandUuid, commentUuid, body),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (commentUuid: string) => demandsApi.removeComment(demandUuid, commentUuid),
    onMutate: async (commentUuid) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DemandComment[]>(key);
      queryClient.setQueryData<DemandComment[]>(key, (current) =>
        (current ?? []).filter((comment) => comment.uuid !== commentUuid),
      );
      return { previous };
    },
    onError: (_error, _commentUuid, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: invalidate,
  });

  return { add, edit, remove };
}

export function useDemandHistory(demandUuid: string | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: demandActivityKeys.history(demandUuid ?? ''),
    queryFn: ({ pageParam }) => demandsApi.history(demandUuid!, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: Boolean(demandUuid) && enabled,
  });
}
