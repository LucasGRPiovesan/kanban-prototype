import { PermissionSet } from '../../iam/domain/permission-set';

export const NOTIFICATION_REASONS = ['RESPONSIBLE', 'WATCHER'] as const;
export type NotificationReason = (typeof NOTIFICATION_REASONS)[number];

/** A person as notification delivery needs to see them — nothing about their profile. */
export interface NotifiablePerson {
  uuid: string;
  /** False for a deactivated account, and for an excluded one (excluding deactivates). */
  active: boolean;
}

/** Someone who opted in to follow the demand, with what it takes to still reach it. */
export interface WatcherCandidate extends NotifiablePerson {
  /** Raw codes of the watcher's role — already empty when the role itself is inactive. */
  permissionCodes: readonly string[];
  /** Allocated to the demand's project. Irrelevant for a demand with no project. */
  memberOfProject: boolean;
  /** Responsible or author — the ways a demand is someone's own without DEMAND_VIEW_ALL. */
  ownsDemand: boolean;
}

export interface RecipientQuestion {
  /** Whoever made the change. Never told about their own change. */
  actorUuid: string;
  responsible: NotifiablePerson;
  /** A reassigned demand's previous responsible, when that is what just changed. */
  formerResponsible?: NotifiablePerson | null;
  demandHasProject: boolean;
  watchers: readonly WatcherCandidate[];
}

export interface Recipient {
  uuid: string;
  reason: NotificationReason;
}

/**
 * Who hears about a change to a demand.
 *
 * - The responsible, always, with no permission required: it is their work.
 * - The previous responsible of a reassignment, the same way — it was theirs a moment ago.
 * - Anyone following the demand, as long as they *still* hold DEMAND_WATCH and could still
 *   open the demand today. A watch is a preference stored once; the right to act on it is
 *   re-derived every time, so revoking the permission or removing someone from the project
 *   silences it immediately without anyone having to clean preferences up.
 *
 * Nobody hears about their own change, and nobody inactive hears about anything. Each
 * person appears at most once — as RESPONSIBLE when both apply, the stronger reason.
 */
export function resolveRecipients(question: RecipientQuestion): Recipient[] {
  const recipients = new Map<string, Recipient>();
  const add = (person: NotifiablePerson | null | undefined, reason: NotificationReason) => {
    if (
      !person ||
      !person.active ||
      person.uuid === question.actorUuid ||
      recipients.has(person.uuid)
    ) {
      return;
    }
    recipients.set(person.uuid, { uuid: person.uuid, reason });
  };

  add(question.responsible, 'RESPONSIBLE');
  add(question.formerResponsible, 'RESPONSIBLE');
  for (const watcher of question.watchers) {
    if (canStillWatch(watcher, question.demandHasProject)) {
      add(watcher, 'WATCHER');
    }
  }
  return [...recipients.values()];
}

/**
 * The same three gates DemandAccessGuard applies to a live request — capability, project
 * allocation, whose work it is — evaluated against a stored watch instead of a session.
 * Built on PermissionSet so ACCESS sovereignty is applied exactly as it is everywhere else.
 */
export function canStillWatch(watcher: WatcherCandidate, demandHasProject: boolean): boolean {
  const permissions = PermissionSet.fromCodes(watcher.permissionCodes);
  if (!permissions.hasAll(['DEMAND_ACCESS', 'DEMAND_WATCH'])) {
    return false;
  }
  if (demandHasProject) {
    const global = permissions.has('PROJECT_ACCESS_ALL');
    // Allocation alone, as in ProjectAccessPolicy — not the Projetos screen's PROJECT_ACCESS.
    if (!global && !watcher.memberOfProject) {
      return false;
    }
  }
  return permissions.has('DEMAND_VIEW_ALL') || watcher.ownsDemand;
}
