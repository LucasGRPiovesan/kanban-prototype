import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { demandsApi, projectsApi } from '@/lib/api/endpoints';
import type { Demand, DemandPriority, DemandStatus } from '@/lib/api/types';

export const demandKeys = {
  all: ['demands'] as const,
  list: (projectUuid?: string, archived?: boolean) =>
    ['demands', 'list', projectUuid ?? 'all', archived ? 'archived' : 'active'] as const,
  detail: (uuid: string) => ['demands', 'detail', uuid] as const,
};

export const projectKeys = {
  list: ['projects'] as const,
  assignees: (projectUuid: string, search?: string) =>
    ['projects', projectUuid, 'assignees', search ?? ''] as const,
};

/**
 * Who may be the responsible of a demand, keyed by the scope that decides it.
 *
 * Keyed under `demands` rather than `projects` because the scope is optional: a demand
 * with no project still has an eligible list, and `['projects', undefined, ...]` would
 * be a cache entry about a project that does not exist.
 */
export const assigneeKeys = {
  of: (projectUuid?: string) => ['demands', 'assignees', projectUuid ?? 'sem-projeto'] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.list,
    queryFn: () => projectsApi.list(),
    staleTime: 60_000,
  });
}

/**
 * Board data.
 *
 * Search is applied client-side because the specification requires filtering *as the
 * user types*: a request per keystroke would lag behind the input and flicker. The
 * dataset is one project's demands, so filtering locally is both instant and cheap.
 */
export function useDemands(projectUuid?: string, archived = false) {
  return useQuery({
    queryKey: demandKeys.list(projectUuid, archived),
    queryFn: () => demandsApi.list({ ...(projectUuid ? { projectUuid } : {}), archived }),
    staleTime: 15_000,
  });
}

export function useDemand(uuid: string | null) {
  return useQuery({
    queryKey: demandKeys.detail(uuid ?? ''),
    queryFn: () => demandsApi.get(uuid!),
    enabled: Boolean(uuid),
  });
}

/**
 * Drag-and-drop status change with optimistic feedback.
 *
 * The card moves immediately so the interaction feels direct, but the server remains
 * the authority: if it rejects the move — a demand in production, a missing
 * DEMAND_UPDATE permission — `onError` restores the previous snapshot and the card
 * returns to its column, exactly as the specification requires.
 */
export function useMoveDemand(projectUuid?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ uuid, status }: { uuid: string; status: DemandStatus }) =>
      demandsApi.move(uuid, status),

    // Optimistic on both readings of the demand: the board's list (the card moves
    // immediately while dragging) and its detail (the status control on the edit
    // form and the details panel read from here, not from the list — without this
    // second write the field looked frozen until the invalidation below refetched it).
    onMutate: async ({ uuid, status }) => {
      const listKey = demandKeys.list(projectUuid);
      const detailKey = demandKeys.detail(uuid);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: listKey }),
        queryClient.cancelQueries({ queryKey: detailKey }),
      ]);
      const previousList = queryClient.getQueryData<Demand[]>(listKey);
      const previousDetail = queryClient.getQueryData<Demand>(detailKey);

      queryClient.setQueryData<Demand[]>(listKey, (current) =>
        (current ?? []).map((demand) =>
          demand.uuid === uuid
            ? { ...demand, status, isTerminal: status === 'PRODUCTION' }
            : demand,
        ),
      );
      queryClient.setQueryData<Demand>(detailKey, (current) =>
        current ? { ...current, status, isTerminal: status === 'PRODUCTION' } : current,
      );

      return { previousList, previousDetail, listKey, detailKey };
    },

    onError: (_error, _variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(context.listKey, context.previousList);
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(context.detailKey, context.previousDetail);
      }
    },

    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: demandKeys.list(projectUuid) });
      void queryClient.invalidateQueries({ queryKey: demandKeys.detail(variables.uuid) });
    },
  });
}

/**
 * Field-level save, used by the inline editors in the details panel.
 *
 * Every write invalidates both the detail and the board: a changed responsible, project
 * or title is visible on the card too, and leaving the board stale would show two
 * different truths on one screen.
 */
export function useUpdateDemand(projectUuid?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uuid, input }: { uuid: string; input: DemandUpdateInput }) =>
      demandsApi.update(uuid, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: demandKeys.detail(variables.uuid) });
      void queryClient.invalidateQueries({ queryKey: demandKeys.all });
      void queryClient.invalidateQueries({ queryKey: demandKeys.list(projectUuid) });
    },
  });
}

export interface DemandUpdateInput {
  title?: string;
  description?: string;
  dueDate?: string;
  responsibleUuid?: string;
  /** `null` detaches the demand from its project; omitted leaves it untouched. */
  projectUuid?: string | null;
  priority?: DemandPriority;
}

/**
 * Checklist writes.
 *
 * Ticking an item is optimistic — it is a checkbox, and a checkbox that waits for a
 * round trip before moving feels broken. The rest are not: adding needs the server's
 * uuid, and removing is destructive enough to be worth confirming against the response.
 */
export function useChecklist(demandUuid: string | null, projectUuid?: string) {
  const queryClient = useQueryClient();
  const key = demandKeys.detail(demandUuid ?? '');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    // The card shows no checklist today, but the board's copy of the demand is the same
    // object — letting it drift would surface the moment a card starts showing progress.
    void queryClient.invalidateQueries({ queryKey: demandKeys.list(projectUuid) });
  };

  const add = useMutation({
    mutationFn: (title: string) => demandsApi.addChecklistItem(demandUuid!, title),
    onSuccess: invalidate,
  });

  const toggle = useMutation({
    mutationFn: ({ itemUuid, done }: { itemUuid: string; done: boolean }) =>
      demandsApi.updateChecklistItem(demandUuid!, itemUuid, { done }),
    onMutate: async ({ itemUuid, done }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Demand>(key);
      queryClient.setQueryData<Demand>(key, (current) =>
        current
          ? {
              ...current,
              checklist: current.checklist.map((item) =>
                item.uuid === itemUuid ? { ...item, done } : item,
              ),
            }
          : current,
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: invalidate,
  });

  const rename = useMutation({
    mutationFn: ({ itemUuid, title }: { itemUuid: string; title: string }) =>
      demandsApi.updateChecklistItem(demandUuid!, itemUuid, { title }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (itemUuid: string) => demandsApi.removeChecklistItem(demandUuid!, itemUuid),
    onSuccess: invalidate,
  });

  return { add, toggle, rename, remove };
}

/**
 * Attachment writes, live against the demand shown in the details panel.
 *
 * There is no draft state here the way there is for the checklist on the creation form:
 * a demand being viewed in the panel already exists, so every upload and every removal
 * is a real request against a real aggregate, exactly like the checklist once the demand
 * exists. Nothing about attachments needs a dedicated screen to work.
 */
export function useAttachments(demandUuid: string | null, projectUuid?: string) {
  const queryClient = useQueryClient();
  const key = demandKeys.detail(demandUuid ?? '');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    // The card's thumbnail is the first attached image, so the board's copy of the
    // demand has to hear about an upload or a removal too.
    void queryClient.invalidateQueries({ queryKey: demandKeys.list(projectUuid) });
  };

  const upload = useMutation({
    mutationFn: (files: File[]) => demandsApi.uploadAttachments(demandUuid!, files),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (attachmentUuid: string) => demandsApi.removeAttachment(demandUuid!, attachmentUuid),
    onSuccess: invalidate,
  });

  return { upload, remove };
}

/**
 * Archives/unarchives a demand. Invalidates both readings of the list — active and
 * archived — since the demand moves from one to the other.
 */
export function useArchiveDemand(projectUuid?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uuid, archived }: { uuid: string; archived: boolean }) =>
      demandsApi.archive(uuid, archived),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: demandKeys.detail(variables.uuid) });
      void queryClient.invalidateQueries({ queryKey: demandKeys.list(projectUuid, false) });
      void queryClient.invalidateQueries({ queryKey: demandKeys.list(projectUuid, true) });
    },
  });
}

export function useDeleteDemand(projectUuid?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (uuid: string) => demandsApi.remove(uuid),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: demandKeys.list(projectUuid) });
    },
  });
}
