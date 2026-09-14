import { type Actor } from '../../../shared/application/actor';
import {
  LOG_ACTIONS,
  LOG_GROUP_LABELS,
  type LogCategory,
  type LogGroup,
  scopeOf,
} from '../../../shared/domain/activity-catalog';
import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';
import { type ProjectAccessResolver } from '../../projects/application/use-cases/project.use-cases';
import { type ProjectRepository } from '../../projects/application/ports/repositories';
import { type LogVisibility, LogVisibilityPolicy } from '../domain/log-visibility';
import {
  clampPageNumber,
  clampPageSize,
  type LogPageDTO,
  type LogQueries,
  type LogSearchFilter,
  toLogPageDTO,
} from './ports';

/**
 * The Logs screen.
 *
 * Visibility is resolved first and handed to the store as a constraint, not appended as
 * one more optional filter: a caller that forgets to pass a filter must still get only
 * what they may see. The explicit checks below exist to turn an impossible request into
 * an honest answer — asking for system events without the permission is a 403, asking
 * for a project outside one's allocation is the same 404 the board gives.
 */
export class ListLogs {
  constructor(
    private readonly queries: LogQueries,
    private readonly projectAccess: ProjectAccessResolver,
  ) {}

  async execute(
    actor: Actor,
    input: { filter: LogSearchFilter; page?: number; limit?: number },
  ): Promise<LogPageDTO> {
    const policy = await this.projectAccess.forActor(actor);
    const visibility = LogVisibilityPolicy.forActor(actor, policy.visibleProjectUuids(actor));

    if (input.filter.category === 'SYSTEM') {
      actor.require('LOG_VIEW_SYSTEM');
    }
    if (input.filter.projectUuid) {
      if (!Uuid.isValid(input.filter.projectUuid)) {
        throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
      }
      policy.assertAccess(actor, Uuid.create(input.filter.projectUuid));
    }

    const pageSize = clampPageSize(input.limit);
    const pageNumber = clampPageNumber(input.page);

    if (LogVisibilityPolicy.seesNothing(visibility)) {
      return { items: [], page: pageNumber, pageSize, total: 0, totalPages: 1 };
    }

    const page = await this.queries.search(visibility, input.filter, {
      page: pageNumber,
      limit: pageSize,
    });
    return toLogPageDTO(page, pageNumber, pageSize);
  }
}

export interface LogActionOptionDTO {
  code: string;
  label: string;
  category: LogCategory;
  group: LogGroup;
  groupLabel: string;
}

export interface LogFiltersDTO {
  categories: LogCategory[];
  canViewOrganization: boolean;
  actions: LogActionOptionDTO[];
  actors: { uuid: string; name: string }[];
  projects: { uuid: string; name: string }[];
}

/**
 * The option lists for the filter bar, trimmed to the actor's visibility.
 *
 * Offering "Perfil alterado" to someone who can never see an organization entry would be
 * a filter that always returns nothing — a dead end that reads as a bug. So every list
 * here is derived from the same LogVisibility the listing uses.
 */
export class GetLogFilters {
  constructor(
    private readonly queries: LogQueries,
    private readonly projectAccess: ProjectAccessResolver,
    private readonly projects: ProjectRepository,
  ) {}

  async execute(actor: Actor): Promise<LogFiltersDTO> {
    const policy = await this.projectAccess.forActor(actor);
    const visibility = LogVisibilityPolicy.forActor(actor, policy.visibleProjectUuids(actor));

    const [actors, projects] = await Promise.all([
      LogVisibilityPolicy.seesNothing(visibility)
        ? Promise.resolve([])
        : this.queries.actorsSeen(visibility),
      this.visibleProjects(visibility),
    ]);

    return {
      categories: (['ACTIVITY', 'SYSTEM'] as const).filter((category) =>
        LogVisibilityPolicy.allowsCategory(visibility, category),
      ),
      canViewOrganization: visibility.organization,
      actions: LOG_ACTIONS.filter((definition) => {
        const scope = scopeOf(definition);
        if (scope === 'SYSTEM') {
          return visibility.system;
        }
        if (scope === 'ORGANIZATION') {
          return visibility.organization;
        }
        return visibility.projectUuids === null || visibility.projectUuids.length > 0;
      }).map((definition) => ({
        code: definition.code,
        label: definition.label,
        category: definition.category,
        group: definition.group,
        groupLabel: LOG_GROUP_LABELS[definition.group],
      })),
      actors,
      projects,
    };
  }

  private async visibleProjects(visibility: LogVisibility): Promise<{ uuid: string; name: string }[]> {
    if (visibility.projectUuids !== null && visibility.projectUuids.length === 0) {
      return [];
    }
    // Inactive projects are included: their history is still history.
    const projects = await this.projects.list({
      activeOnly: false,
      restrictToUuids: visibility.projectUuids,
    });
    return projects.map((project) => ({ uuid: project.uuid.toString(), name: project.name }));
  }
}
