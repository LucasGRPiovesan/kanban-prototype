import { type AfterCommit } from '../../../shared/application/unit-of-work.port';
import { summarizeActivity } from '../../logs/application/summarize';
import {
  type DemandChange,
  type DemandChangeListener,
} from '../../demands/application/ports/demand-change-listener';
import { resolveRecipients } from '../domain/notification-recipients';
import {
  type NotificationPublisher,
  type NotificationRepository,
  type RecipientDirectory,
} from './ports';

/**
 * Turns a recorded demand change into inbox entries and live pushes.
 *
 * Two phases on purpose. The rows are written inside the change's own unit of work, so
 * a notification can never describe a change that rolled back, and a committed change can
 * never lose its notifications. The push to open browsers waits for the commit: sent any
 * earlier, a browser re-fetching on it could read the state from before the change.
 *
 * The push is best-effort by design — a person with no open tab simply finds the entry in
 * their inbox the next time they look, which is what the rows are for.
 */
export class NotifyDemandChange implements DemandChangeListener {
  constructor(
    private readonly directory: RecipientDirectory,
    private readonly notifications: NotificationRepository,
    private readonly publisher: NotificationPublisher,
    private readonly transaction: AfterCommit,
  ) {}

  async demandChanged(change: DemandChange): Promise<void> {
    const { card, actor } = change;
    const people = await this.directory.findPeople({
      demandUuid: card.uuid,
      responsibleUuid: card.responsible.uuid,
      formerResponsibleUuid: change.formerResponsibleUuid,
    });

    const recipients = resolveRecipients({
      actorUuid: actor.uuid,
      responsible: people.responsible ?? { uuid: card.responsible.uuid, active: false },
      formerResponsible: people.formerResponsible,
      demandHasProject: people.demandHasProject,
      watchers: people.watchers,
    });
    if (recipients.length === 0) {
      return;
    }

    const summary = summarizeActivity({
      action: change.action,
      subject: { type: 'DEMAND', uuid: card.uuid, label: card.title },
      project: card.project,
      changes: change.changes,
      metadata: change.metadata,
    });

    const created = await this.notifications.createMany(
      recipients.map((recipient) => ({
        recipientUuid: recipient.uuid,
        reason: recipient.reason,
        action: change.action,
        summary,
        demand: { uuid: card.uuid, title: card.title },
        projectName: card.project?.name ?? null,
        actor: { uuid: actor.uuid, name: actor.name },
        changes: change.changes?.length ? change.changes : null,
      })),
    );

    this.transaction.afterCommit(() => {
      created.forEach(({ recipientUuid, notification }) => {
        // Counted after the commit, so the badge the browser shows includes this entry.
        void this.notifications
          .countUnread(recipientUuid)
          .then((unreadCount) =>
            this.publisher.publish(recipientUuid, {
              type: 'notification',
              notification,
              unreadCount,
            }),
          )
          .catch(() => {
            // Best-effort: the entry is already in the inbox.
          });
      });
    });
  }
}
