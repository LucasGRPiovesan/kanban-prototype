import { type Actor } from '../../../shared/application/actor';
import { type LogCategory } from '../../../shared/domain/activity-catalog';

/**
 * What a given actor may see in the logs, as data the query layer can apply.
 *
 * - `projectUuids`: activity scoped to projects. `null` means every project, `[]` none.
 * - `organization`: administrative activity with no project (users, roles, sessions).
 * - `system`: technical events.
 */
export interface LogVisibility {
  readonly projectUuids: readonly string[] | null;
  readonly organization: boolean;
  readonly system: boolean;
}

/**
 * The single authority on log visibility.
 *
 * Project activity follows exactly the rule the demands themselves follow — the list of
 * visible projects is computed by the projects module and handed in, not re-derived here
 * — so an allocation change is reflected in the logs the moment it is reflected on the
 * board. The two wider views are capabilities, not roles: nothing below mentions a
 * profile name.
 */
export class LogVisibilityPolicy {
  static forActor(actor: Actor, visibleProjectUuids: readonly string[] | null): LogVisibility {
    actor.require('LOG_ACCESS');

    // Without project access at all, "the projects you can see" is the empty set — even
    // if allocations exist, they confer nothing without the module's ACCESS.
    const reachesProjects = actor.can('PROJECT_ACCESS') || actor.hasGlobalProjectAccess();

    return {
      projectUuids: reachesProjects ? visibleProjectUuids : [],
      organization: actor.can('LOG_VIEW_ORGANIZATION'),
      system: actor.can('LOG_VIEW_SYSTEM'),
    };
  }

  static seesNothing(visibility: LogVisibility): boolean {
    return (
      visibility.projectUuids !== null &&
      visibility.projectUuids.length === 0 &&
      !visibility.organization &&
      !visibility.system
    );
  }

  static allowsCategory(visibility: LogVisibility, category: LogCategory): boolean {
    if (category === 'SYSTEM') {
      return visibility.system;
    }
    return (
      visibility.organization ||
      visibility.projectUuids === null ||
      visibility.projectUuids.length > 0
    );
  }
}
