import { useMemo } from 'react';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { LogTimeline, LogTimelineSkeleton } from '@/features/logs/LogTimeline';
import { useDemandHistory } from './useDemandActivity';

/**
 * The "Atualizações" tab: every recorded change to this demand, newest first.
 *
 * Governed by DEMAND_ACCESS, not by the Logs module's permission — someone who may open
 * a demand may know how it got to where it is, without being shown the rest of the
 * system's record. Comments are left out; they have their own tab and would otherwise
 * appear twice.
 */
export function DemandHistory({ demandUuid }: { demandUuid: string }) {
  const history = useDemandHistory(demandUuid, true);
  const entries = useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data],
  );

  if (history.isLoading) {
    return <LogTimelineSkeleton rows={4} />;
  }

  if (history.isError) {
    return (
      <ErrorState title="Atualizações indisponíveis" onRetry={() => void history.refetch()} />
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        icon={<History className="h-5 w-5" />}
        title="Nenhuma atualização registrada"
        description="Edições, movimentações, itens de checklist e anexos aparecem aqui assim que acontecem."
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
