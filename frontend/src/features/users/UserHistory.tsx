import { useMemo } from 'react';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { LogTimeline, LogTimelineSkeleton } from '@/features/logs/LogTimeline';
import { useUserHistory } from './useUsers';

/**
 * The profile screen's "Atualizações" section: every recorded change to this account,
 * newest first — the same shape `DemandHistory` gives a demand's own tab.
 *
 * Governed by USER_ACCESS on the server, not by LOG_ACCESS: whoever may open the
 * Usuários screen may read how one account got here, without the full Logs module.
 */
export function UserHistory({ userUuid }: { userUuid: string }) {
  const history = useUserHistory(userUuid);
  const entries = useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data],
  );

  if (history.isLoading) {
    return <LogTimelineSkeleton rows={4} />;
  }

  if (history.isError) {
    return <ErrorState title="Atualizações indisponíveis" onRetry={() => void history.refetch()} />;
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        icon={<History className="h-5 w-5" />}
        title="Nenhuma atualização registrada"
        description="Edições e mudanças de situação neste usuário aparecem aqui assim que acontecem."
      />
    );
  }

  return (
    <div className="space-y-5">
      <LogTimeline entries={entries} variant="subject" />
      {history.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            loading={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            Carregar atualizações anteriores
          </Button>
        </div>
      )}
    </div>
  );
}
