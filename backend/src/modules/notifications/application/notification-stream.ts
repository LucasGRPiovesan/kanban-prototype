import {
  type NotificationEvent,
  type NotificationRepository,
  type NotificationView,
} from './ports';

export interface NotificationStreamOptions {
  /** How often to look in the database for entries the in-process push did not deliver. */
  pollIntervalMs: number;
  /** End the stream after this long (0 = never) so a serverless function closes cleanly. */
  maxDurationMs: number;
  /** Comment lines that keep proxies from closing a quiet connection. */
  heartbeatMs: number;
}

export interface NotificationStreamTransport {
  sendEvent(event: NotificationEvent): void;
  sendHeartbeat(): void;
  close(): void;
}

export type SubscribeFn = (
  userUuid: string,
  onEvent: (event: NotificationEvent) => void,
  close: () => void,
) => () => void;

/** Upper bound of the delivered-uuid memory; far more than one stream's lifetime produces. */
const REMEMBERED = 500;
const POLL_BATCH = 20;

/**
 * One browser's live notification stream, independent of HTTP.
 *
 * Two delivery paths, deduplicated by notification uuid:
 * - the in-process hub pushes the instant a change commits — instant, but only reaches
 *   streams held by the same process that handled the change;
 * - a periodic look at the recipient's newest rows catches everything else — notifications
 *   written by another instance, which is the normal case on serverless platforms and
 *   under horizontal scaling. Only rows created after the stream opened are sent: older
 *   ones are already in the inbox the page loaded.
 *
 * With a single long-lived server the poll never finds anything new and costs one indexed
 * query per interval per open tab; with several instances it bounds the delay to that
 * interval instead of losing the push altogether.
 */
export class NotificationStreamSession {
  private readonly delivered = new Set<string>();
  private readonly timers: ReturnType<typeof setInterval>[] = [];
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  private openedAt = new Date(0);
  private polling = false;
  private closed = false;

  constructor(
    private readonly userUuid: string,
    private readonly notifications: Pick<NotificationRepository, 'listForRecipient' | 'countUnread'>,
    private readonly subscribe: SubscribeFn,
    private readonly transport: NotificationStreamTransport,
    private readonly options: NotificationStreamOptions,
    private readonly now: () => Date = () => new Date(),
  ) {}

  start(): void {
    // A second of slack: the row's createdAt comes from this same clock family, and a
    // notification committed in the instant the stream opens must not fall in the gap.
    this.openedAt = new Date(this.now().getTime() - 1000);
    this.unsubscribe = this.subscribe(
      this.userUuid,
      (event) => this.deliver(event),
      () => this.stop(true),
    );
    this.timers.push(setInterval(() => this.transport.sendHeartbeat(), this.options.heartbeatMs));
    this.timers.push(setInterval(() => void this.poll(), this.options.pollIntervalMs));
    if (this.options.maxDurationMs > 0) {
      this.maxDurationTimer = setTimeout(() => this.stop(true), this.options.maxDurationMs);
    }
  }

  /** `closeTransport` is false when the client already went away. */
  stop(closeTransport = false): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.timers.forEach((timer) => clearInterval(timer));
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
    }
    this.unsubscribe?.();
    if (closeTransport) {
      this.transport.close();
    }
  }

  /** Exposed for tests; runs on the interval otherwise. */
  async poll(): Promise<void> {
    if (this.closed || this.polling) {
      return;
    }
    this.polling = true;
    try {
      const page = await this.notifications.listForRecipient(this.userUuid, {
        unreadOnly: false,
        limit: POLL_BATCH,
      });
      // Newest first from the repository; delivered oldest first, the order they happened.
      const fresh = page.items
        .filter((item) => item.createdAt >= this.openedAt && !this.delivered.has(item.uuid))
        .reverse();
      if (fresh.length === 0 || this.closed) {
        return;
      }
      const unreadCount = await this.notifications.countUnread(this.userUuid);
      for (const notification of fresh) {
        this.deliver({ type: 'notification', notification, unreadCount });
      }
    } catch {
      // A failed poll is retried on the next tick; the stream itself stays open.
    } finally {
      this.polling = false;
    }
  }

  private deliver(event: NotificationEvent): void {
    if (this.closed || this.delivered.has(event.notification.uuid)) {
      return;
    }
    this.remember(event.notification);
    this.transport.sendEvent(event);
  }

  private remember(notification: NotificationView): void {
    this.delivered.add(notification.uuid);
    if (this.delivered.size > REMEMBERED) {
      const oldest = this.delivered.values().next().value;
      if (oldest !== undefined) {
        this.delivered.delete(oldest);
      }
    }
  }
}
