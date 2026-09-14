import { type Notification as NotificationRow, type Prisma } from '@prisma/client';
import { type FieldChange } from '../../../shared/application/activity-log.port';
import { Uuid } from '../../../shared/domain/identifier';
import { type PrismaDatabase } from '../../../shared/infrastructure/prisma-database';
import { type NotificationReason, type WatcherCandidate } from '../domain/notification-recipients';
import {
  type NewNotification,
  type NotificationPage,
  type NotificationRepository,
  type NotificationView,
  type RecipientDirectory,
  type WatcherRepository,
} from '../application/ports';

const TITLE_MAX = 200;
const NAME_MAX = 160;
const SUMMARY_MAX = 500;

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async createMany(
    notifications: readonly NewNotification[],
  ): Promise<{ recipientUuid: string; notification: NotificationView }[]> {
    if (notifications.length === 0) {
      return [];
    }
    const recipients = await this.database.client.user.findMany({
      where: { uuid: { in: notifications.map((n) => n.recipientUuid) } },
      select: { id: true, uuid: true },
    });
    const idOf = new Map(recipients.map((row) => [row.uuid, row.id]));
    const createdAt = new Date();

    // One statement for every recipient; the views are built from what was written, so
    // the caller gets them back in the order it asked without a second read.
    const rows = notifications
      .filter((n) => idOf.has(n.recipientUuid))
      .map((n) => ({
        recipientUuid: n.recipientUuid,
        uuid: Uuid.generate().toString(),
        recipientUserId: idOf.get(n.recipientUuid)!,
        reason: n.reason,
        action: n.action,
        summary: clip(n.summary, SUMMARY_MAX),
        demandUuid: n.demand.uuid,
        demandTitle: clip(n.demand.title, TITLE_MAX),
        projectName: n.projectName ? clip(n.projectName, NAME_MAX) : null,
        actorUuid: n.actor?.uuid ?? null,
        actorName: n.actor ? clip(n.actor.name, NAME_MAX) : null,
        changes: n.changes ? (n.changes as unknown as Prisma.InputJsonValue) : undefined,
        createdAt,
      }));
    await this.database.client.notification.createMany({
      data: rows.map(({ recipientUuid: _recipient, ...row }) => row),
    });

    return rows.map((row) => ({
      recipientUuid: row.recipientUuid,
      notification: {
        uuid: row.uuid,
        reason: row.reason,
        action: row.action,
        summary: row.summary,
        demand: { uuid: row.demandUuid, title: row.demandTitle },
        projectName: row.projectName,
        actor: row.actorUuid ? { uuid: row.actorUuid, name: row.actorName ?? 'Usuário' } : null,
        changes: (row.changes as unknown as FieldChange[] | undefined) ?? [],
        readAt: null,
        createdAt,
      },
    }));
  }

  async listForRecipient(
    recipientUuid: string,
    options: { unreadOnly: boolean; limit: number; before?: string },
  ): Promise<NotificationPage> {
    const cursor = options.before
      ? await this.database.client.notification.findFirst({
          where: { uuid: options.before, recipient: { uuid: recipientUuid } },
          select: { id: true },
        })
      : null;

    const rows = await this.database.client.notification.findMany({
      where: {
        recipient: { uuid: recipientUuid },
        ...(options.unreadOnly ? { readAt: null } : {}),
        // `id` is monotonic, so "older than the cursor" is a plain range on the primary key.
        ...(cursor ? { id: { lt: cursor.id } } : {}),
      },
      orderBy: { id: 'desc' },
      take: options.limit + 1,
    });

    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;
    return {
      items: page.map(toView),
      nextCursor: hasMore ? (page[page.length - 1]?.uuid ?? null) : null,
    };
  }

  countUnread(recipientUuid: string): Promise<number> {
    return this.database.client.notification.count({
      where: { recipient: { uuid: recipientUuid }, readAt: null },
    });
  }

  async markRead(recipientUuid: string, notificationUuids: readonly string[]): Promise<number> {
    if (notificationUuids.length === 0) {
      return 0;
    }
    const result = await this.database.client.notification.updateMany({
      where: {
        uuid: { in: [...notificationUuids] },
        recipient: { uuid: recipientUuid },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async markAllRead(recipientUuid: string): Promise<number> {
    const result = await this.database.client.notification.updateMany({
      where: { recipient: { uuid: recipientUuid }, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }
}

export class PrismaWatcherRepository implements WatcherRepository {
  constructor(private readonly database: PrismaDatabase) {}

  async watch(userUuid: string, demandUuid: string): Promise<void> {
    const ids = await this.idsOf(userUuid, demandUuid);
    if (!ids) {
      return;
    }
    await this.database.client.demandWatcher.upsert({
      where: { userId_demandId: ids },
      create: ids,
      update: {},
    });
  }

  async unwatch(userUuid: string, demandUuid: string): Promise<void> {
    await this.database.client.demandWatcher.deleteMany({
      where: { user: { uuid: userUuid }, demand: { uuid: demandUuid } },
    });
  }

  async listWatchedDemandUuids(userUuid: string): Promise<string[]> {
    const rows = await this.database.client.demandWatcher.findMany({
      where: { user: { uuid: userUuid } },
      select: { demand: { select: { uuid: true } } },
    });
    return rows.map((row) => row.demand.uuid);
  }

  private async idsOf(userUuid: string, demandUuid: string) {
    const [user, demand] = await Promise.all([
      this.database.client.user.findUnique({ where: { uuid: userUuid }, select: { id: true } }),
      this.database.client.demand.findUnique({ where: { uuid: demandUuid }, select: { id: true } }),
    ]);
    return user && demand ? { userId: user.id, demandId: demand.id } : null;
  }
}

const PERSON_SELECT = { uuid: true, active: true, deletedAt: true } as const;

export class PrismaRecipientDirectory implements RecipientDirectory {
  constructor(private readonly database: PrismaDatabase) {}

  async findPeople(input: {
    demandUuid: string;
    responsibleUuid: string;
    formerResponsibleUuid?: string;
  }) {
    const client = this.database.client;
    const [demand, responsible, formerResponsible] = await Promise.all([
      client.demand.findUnique({
        where: { uuid: input.demandUuid },
        select: {
          projectId: true,
          createdBy: { select: { uuid: true } },
          responsible: { select: { uuid: true } },
          watchers: {
            select: {
              user: {
                select: {
                  ...PERSON_SELECT,
                  role: {
                    select: {
                      active: true,
                      permissions: { select: { permission: { select: { code: true } } } },
                    },
                  },
                  memberships: { select: { projectId: true } },
                },
              },
            },
          },
        },
      }),
      client.user.findUnique({ where: { uuid: input.responsibleUuid }, select: PERSON_SELECT }),
      input.formerResponsibleUuid
        ? client.user.findUnique({
            where: { uuid: input.formerResponsibleUuid },
            select: PERSON_SELECT,
          })
        : Promise.resolve(null),
    ]);

    const watchers: WatcherCandidate[] = (demand?.watchers ?? []).map(({ user }) => ({
      uuid: user.uuid,
      active: isReachable(user),
      // An inactive role confers nothing — the same rule the session resolver applies.
      permissionCodes: user.role.active
        ? user.role.permissions.map((rp) => rp.permission.code)
        : [],
      memberOfProject:
        demand?.projectId != null && user.memberships.some((m) => m.projectId === demand.projectId),
      ownsDemand: user.uuid === demand?.createdBy.uuid || user.uuid === demand?.responsible.uuid,
    }));

    return {
      responsible: responsible
        ? { uuid: responsible.uuid, active: isReachable(responsible) }
        : null,
      formerResponsible: formerResponsible
        ? { uuid: formerResponsible.uuid, active: isReachable(formerResponsible) }
        : null,
      demandHasProject: demand?.projectId != null,
      watchers,
    };
  }
}

function isReachable(user: { active: boolean; deletedAt: Date | null }): boolean {
  return user.active && user.deletedAt === null;
}

function toView(row: NotificationRow): NotificationView {
  return {
    uuid: row.uuid,
    reason: row.reason as NotificationReason,
    action: row.action,
    summary: row.summary,
    demand: { uuid: row.demandUuid, title: row.demandTitle },
    projectName: row.projectName,
    actor: row.actorUuid ? { uuid: row.actorUuid, name: row.actorName ?? 'Usuário' } : null,
    changes: Array.isArray(row.changes) ? (row.changes as unknown as FieldChange[]) : [],
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
