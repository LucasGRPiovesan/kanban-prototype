import { type FieldChange } from '../../../shared/application/activity-log.port';
import {
  type NotifiablePerson,
  type NotificationReason,
  type WatcherCandidate,
} from '../domain/notification-recipients';

export interface NewNotification {
  recipientUuid: string;
  reason: NotificationReason;
  action: string;
  summary: string;
  demand: { uuid: string; title: string };
  projectName: string | null;
  actor: { uuid: string; name: string } | null;
  changes: FieldChange[] | null;
}

export interface NotificationView {
  uuid: string;
  reason: NotificationReason;
  action: string;
  summary: string;
  demand: { uuid: string; title: string };
  projectName: string | null;
  actor: { uuid: string; name: string } | null;
  changes: FieldChange[];
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationPage {
  items: NotificationView[];
  /** Pass back as `before` to read the next (older) page; `null` once there is none. */
  nextCursor: string | null;
}

export interface NotificationRepository {
  /** Writes through the open unit of work, so the rows commit with the change they describe. */
  createMany(
    notifications: readonly NewNotification[],
  ): Promise<{ recipientUuid: string; notification: NotificationView }[]>;
  /** Newest first, keyset-paginated: an inbox grows at the top while someone scrolls it. */
  listForRecipient(
    recipientUuid: string,
    options: { unreadOnly: boolean; limit: number; before?: string },
  ): Promise<NotificationPage>;
  countUnread(recipientUuid: string): Promise<number>;
  /** Only ever touches the recipient's own rows; returns how many changed. */
  markRead(recipientUuid: string, notificationUuids: readonly string[]): Promise<number>;
  markAllRead(recipientUuid: string): Promise<number>;
}

export interface WatcherRepository {
  watch(userUuid: string, demandUuid: string): Promise<void>;
  unwatch(userUuid: string, demandUuid: string): Promise<void>;
  listWatchedDemandUuids(userUuid: string): Promise<string[]>;
}

/** The facts recipient resolution needs about one demand's people, read in one place. */
export interface RecipientDirectory {
  findPeople(input: {
    demandUuid: string;
    responsibleUuid: string;
    formerResponsibleUuid?: string;
  }): Promise<{
    responsible: NotifiablePerson | null;
    formerResponsible: NotifiablePerson | null;
    demandHasProject: boolean;
    watchers: WatcherCandidate[];
  }>;
}

/** What a connected browser receives. Deliberately small: it re-fetches what it shows. */
export interface NotificationEvent {
  type: 'notification';
  notification: NotificationView;
  unreadCount: number;
}

/**
 * Pushes events to a person's open sessions.
 *
 * In-process today — a single API instance holds every open stream. Scaling out to several
 * instances means swapping the implementation for one backed by a shared bus (Redis
 * pub/sub, for instance); nothing that publishes or subscribes would change.
 */
export interface NotificationPublisher {
  publish(userUuid: string, event: NotificationEvent): void;
}
