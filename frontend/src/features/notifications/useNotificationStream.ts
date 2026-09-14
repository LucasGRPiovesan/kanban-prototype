import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/providers/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { apiUrl } from '@/lib/api/client';
import { notificationsApi } from '@/lib/api/endpoints';
import type { NotificationStreamEvent } from '@/lib/api/types';
import { notificationSentence } from './notificationPresentation';
import { playNotificationSound, primeNotificationSound } from './notificationSound';
import { notificationKeys } from './useNotifications';

/**
 * Keeps one Server-Sent Events connection open for the signed-in person.
 *
 * On each event: the badge count is set from the event itself, the inbox and whatever
 * demand data is on screen are refreshed (someone else just changed a demand this person
 * cares about, so the board and an open details panel should show it without a reload),
 * and the chime plays with a short toast.
 *
 * EventSource reconnects on its own after a dropped connection; closing happens only on
 * sign-out or unmount. Mounted once, in the application shell.
 */
export function useNotificationStream() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  // The toast function is stable, but reading it through a ref keeps the connection from
  // ever being torn down and reopened because a dependency identity changed.
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const userUuid = session?.user.uuid;

  useEffect(() => primeNotificationSound(), []);

  useEffect(() => {
    if (!userUuid || typeof window.EventSource === 'undefined') {
      return;
    }
    const source = new EventSource(apiUrl(notificationsApi.streamPath), { withCredentials: true });

    const onNotification = (message: MessageEvent<string>) => {
      let event: NotificationStreamEvent;
      try {
        event = JSON.parse(message.data) as NotificationStreamEvent;
      } catch {
        return;
      }
      queryClient.setQueryData(notificationKeys.unreadCount, { unreadCount: event.unreadCount });
      void queryClient.invalidateQueries({ queryKey: [...notificationKeys.all, 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['demands'] });

      playNotificationSound();
      notifyRef.current(notificationSentence(event.notification), 'info');
    };

    // After a reconnect, anything that arrived while disconnected is only in the inbox.
    const onOpen = () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount });
    };

    source.addEventListener('notification', onNotification);
    source.addEventListener('open', onOpen);
    return () => {
      source.removeEventListener('notification', onNotification);
      source.removeEventListener('open', onOpen);
      source.close();
    };
  }, [userUuid, queryClient]);
}
