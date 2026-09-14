import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, CheckCheck, Volume2, VolumeX } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/relativeTime';
import type { AppNotification } from '@/lib/api/types';
import { canOpenNotificationDemand, notificationIcon } from './notificationPresentation';
import { isNotificationSoundMuted, setNotificationSoundMuted } from './notificationSound';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotificationList,
  useUnreadNotificationCount,
} from './useNotifications';

/**
 * The inbox in the top bar: a bell with the unread count, opening a panel of the latest
 * changes to the demands this person is responsible for or follows.
 *
 * Seen is individual and explicit — opening the panel marks nothing. An entry becomes read
 * when it is clicked (which also opens the demand) or through "marcar todas como lidas", so
 * a glance at the list never silently clears what someone has not actually looked at.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [muted, setMuted] = useState(isNotificationSoundMuted);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const unread = useUnreadNotificationCount();
  const list = useNotificationList(unreadOnly, open);
  const markRead = useMarkNotificationsRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = unread.data ?? 0;
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const openNotification = (notification: AppNotification) => {
    if (!notification.readAt) {
      markRead.mutate([notification.uuid]);
    }
    if (canOpenNotificationDemand(notification)) {
      setOpen(false);
      navigate(`/kanban?demanda=${notification.demand.uuid}`);
    }
  };

  const toggleSound = () => {
    setNotificationSoundMuted(!muted);
    setMuted(!muted);
  };

  const label =
    unreadCount > 0
      ? `Notificações: ${unreadCount} não ${unreadCount === 1 ? 'lida' : 'lidas'}`
      : 'Notificações';

  return (
    <div ref={rootRef} className="relative">
      <Tooltip label="Notificações">
        <IconButton
          label={label}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((current) => !current)}
          className={cn('relative', open && 'bg-surface-muted text-body')}
          icon={
            unreadCount > 0 ? (
              // Keyed on the count, so the swing replays each time another one arrives.
              <BellRing
                key={unreadCount}
                className="h-[1.15rem] w-[1.15rem] origin-top motion-safe:animate-bell-ring"
              />
            ) : (
              <Bell className="h-[1.15rem] w-[1.15rem]" />
            )
          }
        />
      </Tooltip>
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-[1.15rem] min-w-[1.15rem] animate-pop-in items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-bold leading-none text-white ring-2 ring-surface"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Notificações"
          className={cn(
            'z-50 flex animate-rise-in flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-panel',
            // Phones: a sheet spanning the width under the top bar. Wider: anchored to the bell.
            'fixed inset-x-4 top-[4.25rem] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[24rem]',
          )}
        >
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <h2 className="flex-1 text-sm font-bold text-body">
              Notificações
              {unreadCount > 0 && (
                <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[0.6875rem] font-bold text-brand-700">
                  {unreadCount}
                </span>
              )}
            </h2>
            <Tooltip label={muted ? 'Ativar som' : 'Silenciar som'}>
              <IconButton
                label={muted ? 'Ativar som das notificações' : 'Silenciar som das notificações'}
                icon={muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                onClick={toggleSound}
                className="h-8 w-8"
              />
            </Tooltip>
            <Button
              variant="ghost"
              size="sm"
              icon={<CheckCheck className="h-3.5 w-3.5" />}
              disabled={unreadCount === 0}
              loading={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              Marcar todas como lidas
            </Button>
          </div>

          <div role="tablist" aria-label="Filtrar notificações" className="flex gap-1 px-4 pt-3">
            {[
              { value: false, text: 'Todas' },
              { value: true, text: 'Não lidas' },
            ].map((tab) => (
              <button
                key={tab.text}
                type="button"
                role="tab"
                aria-selected={unreadOnly === tab.value}
                onClick={() => setUnreadOnly(tab.value)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors duration-150',
                  unreadOnly === tab.value
                    ? 'bg-brand-100 text-brand-700'
                    : 'text-muted hover:bg-surface-muted hover:text-body',
                )}
              >
                {tab.text}
              </button>
            ))}
          </div>

          <div className="scroll-slim max-h-[min(28rem,calc(100vh-10rem))] overflow-y-auto p-2">
            {list.isLoading && (
              <div className="space-y-2 p-2" aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="flex gap-3">
                    <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-4/5" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {list.isError && (
              <ErrorState title="Notificações indisponíveis" onRetry={() => void list.refetch()} />
            )}

            {list.isSuccess && items.length === 0 && (
              <EmptyState
                compact
                icon={<Bell className="h-5 w-5" />}
                title={unreadOnly ? 'Nada pendente' : 'Nenhuma notificação ainda'}
                description={
                  unreadOnly
                    ? 'Você já viu todas as suas notificações.'
                    : 'Mudanças nas demandas sob sua responsabilidade — ou que você acompanha — aparecem aqui.'
                }
              />
            )}

            {items.length > 0 && (
              <ul className="space-y-0.5">
                {items.map((notification) => (
                  <li key={notification.uuid}>
                    <NotificationItem
                      notification={notification}
                      onOpen={() => openNotification(notification)}
                    />
                  </li>
                ))}
              </ul>
            )}

            {list.hasNextPage && (
              <div className="p-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  loading={list.isFetchingNextPage}
                  onClick={() => void list.fetchNextPage()}
                >
                  Carregar mais
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onOpen,
}: {
  notification: AppNotification;
  onOpen: () => void;
}) {
  const Icon = notificationIcon(notification.action);
  const unread = !notification.readAt;
  const openable = canOpenNotificationDemand(notification);
  const summary = notification.summary;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-150',
        unread ? 'bg-brand-50/60 hover:bg-brand-50' : 'hover:bg-surface-muted',
        !openable && !unread && 'cursor-default',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          unread ? 'bg-brand-100 text-brand-700' : 'bg-surface-muted text-subtle',
        )}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm leading-snug', unread ? 'text-body' : 'text-muted')}>
          {notification.actor && (
            <span className="font-bold text-body">{notification.actor.name} </span>
          )}
          {notification.actor ? `${summary.charAt(0).toLowerCase()}${summary.slice(1)}` : summary}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-subtle">
          <time dateTime={notification.createdAt} title={formatDateTime(notification.createdAt)}>
            {formatRelative(notification.createdAt)}
          </time>
          {notification.projectName && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{notification.projectName}</span>
            </>
          )}
          {notification.reason === 'WATCHER' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-brand-700">
                <BellRing className="h-3 w-3" aria-hidden="true" />
                Acompanhando
              </span>
            </>
          )}
        </span>
      </span>
      {unread && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="Não lida" />
      )}
    </button>
  );
}
