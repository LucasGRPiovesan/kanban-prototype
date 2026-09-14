import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assistantApi } from '@/lib/api/endpoints';
import type { AssistantAnswer, AssistantCommand } from '@/lib/api/types';
import type { ComposeAction } from './shortcuts';

export const assistantKeys = {
  status: ['assistant', 'status'] as const,
};

export function useAssistantStatus(enabled: boolean) {
  return useQuery({
    queryKey: assistantKeys.status,
    queryFn: assistantApi.status,
    enabled,
    staleTime: 60_000,
  });
}

export function useUpdateAssistantSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: assistantApi.updateSettings,
    onSuccess: (status) => queryClient.setQueryData(assistantKeys.status, status),
  });
}

export type AssistantView =
  | { kind: 'home' }
  | { kind: 'compose'; action: ComposeAction; prompt?: string }
  | { kind: 'answer'; answer: AssistantAnswer; command: AssistantCommand }
  | { kind: 'created'; uuid: string; title: string; projectName: string }
  | { kind: 'settings' };

/**
 * The conversation with the assistant, owned by the button rather than by the panel.
 *
 * Holding the state one level up is what lets someone read a report, open a cited demand
 * beside it — the panels now sit side by side instead of the chat closing — and come back
 * to the same report afterwards.
 */
export function useAssistantSession(projectUuid?: string) {
  const [view, setView] = useState<AssistantView>({ kind: 'home' });
  const mutation = useMutation({ mutationFn: assistantApi.run });
  const { mutate, reset } = mutation;

  const run = useCallback(
    (command: AssistantCommand) => {
      const full: AssistantCommand = { projectUuid, ...command };
      mutate(full, { onSuccess: (answer) => setView({ kind: 'answer', answer, command: full }) });
    },
    [mutate, projectUuid],
  );

  const go = useCallback(
    (next: AssistantView) => {
      reset();
      setView(next);
    },
    [reset],
  );

  const retry = useCallback(() => {
    if (mutation.variables) {
      run(mutation.variables);
    }
  }, [mutation.variables, run]);

  return {
    view,
    go,
    run,
    retry,
    pending: mutation.isPending,
    error: mutation.error,
    lastCommand: mutation.variables,
  };
}

export type AssistantSession = ReturnType<typeof useAssistantSession>;
