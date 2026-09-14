import { describe, expect, it } from 'vitest';
import { type AfterCommit } from '../../src/shared/application/unit-of-work.port';
import { type DemandCardView } from '../../src/modules/demands/application/ports/repositories';
import { NotifyDemandChange } from '../../src/modules/notifications/application/notify-demand-change';
import {
  type NewNotification,
  type NotificationEvent,
  type NotificationPublisher,
  type NotificationRepository,
  type RecipientDirectory,
} from '../../src/modules/notifications/application/ports';

const CARD: DemandCardView = {
  uuid: '0190a000-0000-7000-8000-000000000001',
  title: 'Revisar fluxo de cadastro',
  description: '',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  dueDate: '2026-09-20',
  project: { uuid: '0190a000-0000-7000-8000-0000000000aa', name: 'Portal' },
  responsible: { uuid: 'dev', name: 'Dev', avatarUrl: null, active: true, deletedAt: null },
  createdBy: { uuid: 'admin-1', name: 'Admin 1' },
  attachmentCount: 0,
  previewThumbnailKey: null,
  checklist: [],
  archived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function setup() {
  const written: NewNotification[] = [];
  const published: { userUuid: string; event: NotificationEvent }[] = [];
  const deferred: (() => void)[] = [];

  const directory: RecipientDirectory = {
    findPeople: async () => ({
      responsible: { uuid: 'dev', active: true },
      formerResponsible: null,
      demandHasProject: true,
      watchers: [
        {
          uuid: 'admin-2',
          active: true,
          permissionCodes: ['DEMAND_ACCESS', 'DEMAND_VIEW_ALL', 'DEMAND_WATCH', 'PROJECT_ACCESS', 'PROJECT_ACCESS_ALL'],
          memberOfProject: false,
          ownsDemand: false,
        },
      ],
    }),
  };
  const repository: Pick<NotificationRepository, 'createMany' | 'countUnread'> = {
    createMany: async (items) => {
      written.push(...items);
      return items.map((item, index) => ({
        recipientUuid: item.recipientUuid,
        notification: {
          uuid: `n-${index}`,
          reason: item.reason,
          action: item.action,
          summary: item.summary,
          demand: item.demand,
          projectName: item.projectName,
          actor: item.actor,
          changes: item.changes ?? [],
          readAt: null,
          createdAt: new Date(),
        },
      }));
    },
    countUnread: async () => 3,
  };
  const publisher: NotificationPublisher = {
    publish: (userUuid, event) => published.push({ userUuid, event }),
  };
  const transaction: AfterCommit = { afterCommit: (callback) => deferred.push(callback) };

  const notify = new NotifyDemandChange(
    directory,
    repository as NotificationRepository,
    publisher,
    transaction,
  );
  return { notify, written, published, deferred };
}

describe('NotifyDemandChange', () => {
  it('writes one entry per recipient, excluding the actor, with a readable summary', async () => {
    const { notify, written } = setup();
    await notify.demandChanged({
      actor: { uuid: 'admin-1', name: 'Admin 1' },
      action: 'demand.status_changed',
      card: CARD,
      changes: [{ field: 'status', from: 'NOT_STARTED', to: 'IN_PROGRESS' }],
    });

    expect(written.map((n) => [n.recipientUuid, n.reason])).toEqual([
      ['dev', 'RESPONSIBLE'],
      ['admin-2', 'WATCHER'],
    ]);
    expect(written[0]?.summary).toBe(
      'Moveu a demanda "Revisar fluxo de cadastro" de Não iniciada para Em andamento',
    );
  });

  it('pushes to browsers only after the commit', async () => {
    const { notify, published, deferred } = setup();
    await notify.demandChanged({
      actor: { uuid: 'admin-1', name: 'Admin 1' },
      action: 'demand.comment_added',
      card: CARD,
    });

    expect(published).toEqual([]);
    deferred.forEach((callback) => callback());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(published.map((p) => p.userUuid).sort()).toEqual(['admin-2', 'dev']);
    expect(published[0]?.event.unreadCount).toBe(3);
  });
});
