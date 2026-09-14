import { type Actor } from '../../../shared/application/actor';
import { DomainError } from '../../../shared/domain/errors';
import { type Uuid } from '../../../shared/domain/identifier';

/**
 * Contextual authorization: *where* an actor is allowed to act.
 *
 * The rule is deliberately expressed in terms of permissions and membership, never
 * `role === 'ADMIN'`. An administrator sees every project because the seed grants the
 * Administrador role PROJECT_ACCESS_ALL — remove that permission and the very same
 * code correctly restricts them to their allocations. Custom roles get the same
 * treatment for free.
 */
export class ProjectAccessPolicy {
  /**
   * @param membership set of project uuids the actor is allocated to
   */
  constructor(private readonly membership: ReadonlySet<string>) {}

  static forMemberships(projectUuids: readonly string[]): ProjectAccessPolicy {
    return new ProjectAccessPolicy(new Set(projectUuids));
  }

  /**
   * `null` means the subject is not attached to any project, so there is no isolation
   * boundary to cross and nothing here to decide — whatever else governs it (for a
   * demand: being its responsible, or holding DEMAND_VIEW_ALL) decides alone.
   */
  canAccess(actor: Actor, projectUuid: Uuid | null): boolean {
    if (projectUuid === null) {
      return true;
    }
    if (!actor.can('PROJECT_ACCESS') && !actor.hasGlobalProjectAccess()) {
      return false;
    }
    if (actor.hasGlobalProjectAccess()) {
      return true;
    }
    return this.membership.has(projectUuid.toString());
  }

  /**
   * Deliberately reports "not found" rather than "forbidden" for a project the actor
   * cannot reach: confirming that a project exists is itself a leak across the
   * isolation boundary.
   */
  assertAccess(actor: Actor, projectUuid: Uuid | null): void {
    if (!this.canAccess(actor, projectUuid)) {
      throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
    }
  }

  /** `null` means "no restriction" — the actor may see every project. */
  visibleProjectUuids(actor: Actor): readonly string[] | null {
    if (actor.hasGlobalProjectAccess()) {
      return null;
    }
    return [...this.membership];
  }
}
