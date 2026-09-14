import { type Actor } from '../../../shared/application/actor';
import { type FieldChange } from '../../../shared/application/activity-log.port';
import { DomainError } from '../../../shared/domain/errors';
import { type DemandAccessGuard } from '../../demands/application/use-cases/demand.use-cases';
import { type NotificationReason } from '../domain/notification-recipients';
import {
  type NotificationRepository,
  type NotificationView,
  type WatcherRepository,
} from './ports';

export interface NotificationDTO {
  uuid: string;
  reason: NotificationReason;
  action: string;
  summary: string;
  demand: { uuid: string; title: string };
  projectName: string | null;
  actor: { uuid: string; name: string } | null;
  changes: FieldChange[];
  readAt: string | null;
  createdAt: string;
}

export function toNotificationDTO(view: NotificationView): NotificationDTO {
  return {
    ...view,
    readAt: view.readAt?.toISOString() ?? null,
    createdAt: view.createdAt.toISOString(),
  };
}

const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;

/**
 * A person's own inbox.
 *
 * Needs no permission beyond being signed in: every notification row belongs to exactly
 * one recipient, and every query here is bounded by the actor's own uuid, so there is no
 * one else's data to protect it from.
 */
export class ListNotifications {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(
    actor: Actor,
    input: { unreadOnly?: boolean; limit?: number; before?: string },
  ): Promise<{ items: NotificationDTO[]; nextCursor: string | null; unreadCount: number }> {
    const recipient = actor.userUuid.toString();
    const [page, unreadCount] = await Promise.all([
      this.notifications.listForRecipient(recipient, {
        unreadOnly: input.unreadOnly ?? false,
        limit: Math.min(Math.max(input.limit ?? PAGE_DEFAULT, 1), PAGE_MAX),
        before: input.before,
      }),
      this.notifications.countUnread(recipient),
    ]);
    return { items: page.items.map(toNotificationDTO), nextCursor: page.nextCursor, unreadCount };
  }
}

export class GetUnreadNotificationCount {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(actor: Actor): Promise<{ unreadCount: number }> {
    return { unreadCount: await this.notifications.countUnread(actor.userUuid.toString()) };
  }
}

export class MarkNotificationsRead {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(actor: Actor, uuids: readonly string[]): Promise<{ unreadCount: number }> {
    const recipient = actor.userUuid.toString();
    await this.notifications.markRead(recipient, uuids);
    return { unreadCount: await this.notifications.countUnread(recipient) };
  }
}

export class MarkAllNotificationsRead {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(actor: Actor): Promise<{ unreadCount: number }> {
    await this.notifications.markAllRead(actor.userUuid.toString());
    return { unreadCount: 0 };
  }
}

/**
 * The demands the actor chose to follow. Empty for anyone without DEMAND_WATCH, even if
 * rows survive from before the permission was revoked — the board should not show a bell
 * for a watch that no longer delivers anything.
 */
export class ListWatchedDemands {
  constructor(private readonly watchers: WatcherRepository) {}

  async execute(actor: Actor): Promise<{ demandUuids: string[] }> {
    actor.require('DEMAND_ACCESS');
    if (!actor.can('DEMAND_WATCH')) {
      return { demandUuids: [] };
    }
    return { demandUuids: await this.watchers.listWatchedDemandUuids(actor.userUuid.toString()) };
  }
}

/**
 * Turns notifications for one demand on or off, for the actor alone.
 *
 * Goes through DemandAccessGuard like every other demand-scoped operation: following a
 * demand is only meaningful — and only allowed — for a demand the actor can open. Both
 * directions are idempotent, so a double click or a retried request is harmless.
 */
export class SetDemandWatch {
  constructor(
    private readonly guard: DemandAccessGuard,
    private readonly watchers: WatcherRepository,
  ) {}

  async execute(
    actor: Actor,
    demandUuid: string,
    watching: boolean,
  ): Promise<{ demandUuid: string; watching: boolean }> {
    actor.requireAll(['DEMAND_ACCESS', 'DEMAND_WATCH']);
    const demand = await this.guard.loadAccessible(actor, demandUuid);
    const uuid = demand.uuid.toString();

    if (watching && demand.responsibleUserUuid.equals(actor.userUuid)) {
      throw DomainError.conflict(
        'DEMAND_WATCH_RESPONSIBLE',
        'Você é o responsável por esta demanda e já recebe as notificações dela.',
      );
    }

    if (watching) {
      await this.watchers.watch(actor.userUuid.toString(), uuid);
    } else {
      await this.watchers.unwatch(actor.userUuid.toString(), uuid);
    }
    return { demandUuid: uuid, watching };
  }
}
