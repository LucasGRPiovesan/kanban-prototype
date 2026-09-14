import { type NotificationEvent, type NotificationPublisher } from '../application/ports';

export type NotificationSubscriber = (event: NotificationEvent) => void;

/**
 * Fan-out of notification events to the streams open in this process.
 *
 * A person may have several tabs (or devices) open; each is its own subscriber, and every
 * one of them receives the event. Subscribers are plain callbacks, so this knows nothing
 * about HTTP — the Server-Sent Events route adapts a response into one.
 *
 * Single-instance by nature. Running more than one API replica means replacing this with
 * a publisher over a shared bus; see NotificationPublisher.
 */
export class InMemoryNotificationHub implements NotificationPublisher {
  private readonly subscribers = new Map<string, Set<NotificationSubscriber>>();
  private readonly closers = new Set<() => void>();

  /**
   * `close` ends the underlying stream; it is called on shutdown, since an open event
   * stream never finishes by itself and would otherwise hold the server open until the
   * shutdown timeout kills the process.
   */
  subscribe(userUuid: string, subscriber: NotificationSubscriber, close: () => void): () => void {
    const set = this.subscribers.get(userUuid) ?? new Set<NotificationSubscriber>();
    set.add(subscriber);
    this.subscribers.set(userUuid, set);
    this.closers.add(close);
    return () => {
      this.closers.delete(close);
      set.delete(subscriber);
      if (set.size === 0) {
        this.subscribers.delete(userUuid);
      }
    };
  }

  disconnectAll(): void {
    for (const close of [...this.closers]) {
      close();
    }
  }

  publish(userUuid: string, event: NotificationEvent): void {
    for (const subscriber of this.subscribers.get(userUuid) ?? []) {
      try {
        subscriber(event);
      } catch {
        // One broken stream must not stop delivery to the person's other tabs.
      }
    }
  }

  /** Open streams, for diagnostics and tests. */
  connectionCount(): number {
    let total = 0;
    for (const set of this.subscribers.values()) {
      total += set.size;
    }
    return total;
  }
}
