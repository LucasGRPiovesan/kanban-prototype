import { Bell, BellOff, BellRing } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import type { Demand } from '@/lib/api/types';
import { useToggleDemandWatch, useWatchedDemands } from './useNotifications';

/**
 * Turns notifications for one demand on or off — for the signed-in person only.
 *
 * Renders nothing without DEMAND_WATCH, and nothing for the demand's own responsible, who
 * is notified by default and has nothing to opt into.
 *
 * `card`: an icon on the Kanban card. While active it is always visible (the card says
 * "you are following this"); while inactive it only appears on hover, so a board full of
 * unfollowed cards is not a board full of bells.
 * `panel`: a labelled button for the details panel header.
 */
export function DemandWatchToggle({
  demand,
  variant,
}: {
  demand: Demand;
  variant: 'card' | 'panel';
}) {
  const { session } = useAuth();
  const { notify } = useToast();
  const { enabled, watching } = useWatchedDemands();
  const toggle = useToggleDemandWatch();

  const isResponsible = session?.user.uuid === demand.responsible.uuid;
  if (!enabled || isResponsible) {
    return null;
  }

  const active = watching.has(demand.uuid);
  const change = () =>
    toggle.mutate(
      { demandUuid: demand.uuid, watching: !active },
      {
        onSuccess: () =>
          notify(
            active
              ? 'Notificações desta demanda desativadas.'
              : 'Notificações ativadas: você será avisado de cada mudança nesta demanda.',
            'success',
          ),
        onError: (error) =>
          notify(
            error instanceof ApiError ? error.message : 'Não foi possível alterar as notificações.',
            'error',
          ),
      },
    );

  if (variant === 'panel') {
    return (
      <Button
        variant="secondary"
        size="sm"
        aria-pressed={active}
        loading={toggle.isPending}
        onClick={change}
        icon={active ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        className={cn(active && 'border-brand-500 bg-brand-50 text-brand-700 hover:bg-brand-100')}
      >
        {active ? 'Notificações ativas' : 'Ativar notificações'}
      </Button>
    );
  }

  // The card is the drag handle and the "open details" target: none of this may reach it.
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  return (
    <Tooltip label={active ? 'Notificações ativas — clique para desativar' : 'Ativar notificações'}>
      <button
        type="button"
        aria-pressed={active}
        aria-label={
          active
            ? `Desativar notificações de "${demand.title}"`
            : `Ativar notificações de "${demand.title}"`
        }
        onPointerDown={stop}
        onMouseDown={stop}
        onKeyDown={stop}
        onClick={(event) => {
          stop(event);
          change();
        }}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded transition-opacity duration-200',
          active
            ? 'text-brand-600'
            : 'text-subtle opacity-0 hover:text-body focus-visible:opacity-100 group-hover:opacity-100',
        )}
      >
        {active ? (
          <BellRing className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <Bell className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </Tooltip>
  );
}
