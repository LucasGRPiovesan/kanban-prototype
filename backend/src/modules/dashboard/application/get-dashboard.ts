import { type Actor } from '../../../shared/application/actor';
import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';
import { type DemandQueries } from '../../demands/application/ports/repositories';
import { type ProjectRepository } from '../../projects/application/ports/repositories';
import { type ProjectAccessResolver } from '../../projects/application/use-cases/project.use-cases';
import {
  computeDashboard,
  type DashboardMetrics,
  type StatusTransition,
} from '../domain/dashboard-metrics';

export const DASHBOARD_PERIODS = [30, 90] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

/**
 * Status transitions, read from the activity record — the only place that knows when a
 * demand moved, since the demand row only holds where it is now.
 */
export interface DemandFlowQueries {
  statusTransitions(demandUuids: readonly string[]): Promise<StatusTransition[]>;
}

export interface DashboardDTO extends DashboardMetrics {
  generatedAt: string;
  scope: { projectUuid: string | null };
}

/**
 * The Dashboard: a reading of the demands the actor can already see, never more.
 *
 * Governed by DEMAND_ACCESS rather than by a permission of its own because it exposes
 * no information the demand list does not: the same demands, scoped by the same
 * project visibility, only counted instead of listed. The transition history it reads is
 * the same one the demand's own "Atualizações" tab shows under the same permission.
 */
export class GetDashboard {
  constructor(
    private readonly demands: DemandQueries,
    private readonly flow: DemandFlowQueries,
    private readonly projects: ProjectRepository,
    private readonly projectAccess: ProjectAccessResolver,
    private readonly timeZone: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(
    actor: Actor,
    query: { projectUuid?: string; periodDays: DashboardPeriod },
  ): Promise<DashboardDTO> {
    actor.require('DEMAND_ACCESS');
    const policy = await this.projectAccess.forActor(actor);
    const visible = policy.visibleProjectUuids(actor);

    let projectUuid: Uuid | undefined;
    if (query.projectUuid) {
      if (!Uuid.isValid(query.projectUuid)) {
        throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
      }
      projectUuid = Uuid.create(query.projectUuid);
      policy.assertAccess(actor, projectUuid);
    }

    const [cards, projects] = await Promise.all([
      this.demands.listCards({
        restrictToProjectUuids: visible,
        // The dashboard summarizes exactly what the board would list, so it obeys the
        // same DEMAND_VIEW_ALL rule — otherwise the totals would quietly describe work
        // the person is not allowed to open.
        restrictToOwnerUuid: actor.canViewAllDemands() ? undefined : actor.userUuid.toString(),
        projectUuid,
      }),
      this.projects.list({
        activeOnly: false,
        restrictToUuids: projectUuid ? [projectUuid.toString()] : visible,
      }),
    ]);
    const transitions = await this.flow.statusTransitions(cards.map((card) => card.uuid));

    // An inactive project still belongs on the dashboard while it holds demands; an
    // inactive, empty one is noise.
    const withDemands = new Set(
      cards.flatMap((card) => (card.project ? [card.project.uuid] : [])),
    );
    const scopeProjects = projects
      .filter((project) => project.active || withDemands.has(project.uuid.toString()))
      .map((project) => ({ uuid: project.uuid.toString(), name: project.name }));

    const now = this.clock();
    const metrics = computeDashboard({
      demands: cards.map((card) => ({
        uuid: card.uuid,
        title: card.title,
        status: card.status,
        dueDate: card.dueDate,
        createdAt: card.createdAt,
        project: card.project,
        responsible: card.responsible,
      })),
      transitions,
      projects: scopeProjects,
      now,
      timeZone: this.timeZone,
      periodDays: query.periodDays,
    });

    return {
      ...metrics,
      generatedAt: now.toISOString(),
      scope: { projectUuid: projectUuid ? projectUuid.toString() : null },
    };
  }
}
