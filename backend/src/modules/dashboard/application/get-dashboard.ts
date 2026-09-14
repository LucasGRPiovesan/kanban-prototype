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

export const DASHBOARD_SCOPES = ['personal', 'team'] as const;
/**
 * `personal`: the demands the actor is responsible for. `team`: every demand the actor can
 * read — the same set the board lists, bounded by allocation and DEMAND_VIEW_ALL.
 */
export type DashboardScope = (typeof DASHBOARD_SCOPES)[number];

/**
 * Status transitions, read from the activity record — the only place that knows when a
 * demand moved, since the demand row only holds where it is now.
 */
export interface DemandFlowQueries {
  statusTransitions(demandUuids: readonly string[]): Promise<StatusTransition[]>;
}

export interface DashboardDTO extends DashboardMetrics {
  generatedAt: string;
  scope: {
    projectUuid: string | null;
    kind: DashboardScope;
    /** Which scopes this actor may switch between — the screen's toggle reads this. */
    available: DashboardScope[];
  };
}

/** The scopes an actor's permissions allow, most comprehensive first. */
export function availableScopes(actor: Actor): DashboardScope[] {
  const scopes: DashboardScope[] = [];
  if (actor.can('DASHBOARD_VIEW_ALL')) scopes.push('team');
  if (actor.can('DASHBOARD_VIEW_OWN')) scopes.push('personal');
  return scopes;
}

/**
 * The Dashboard: a reading of the demands the actor can already see, never more.
 *
 * Two independent questions decide what it counts. *Which demands the actor may read*
 * comes from the demands module (DEMAND_ACCESS, allocation, DEMAND_VIEW_ALL) and is never
 * widened here. *Whose indicators to consolidate* comes from the dashboard's own scope
 * permissions: DASHBOARD_VIEW_OWN reads the actor's own work, DASHBOARD_VIEW_ALL the team's.
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

  /** The Dashboard screen: requires the module and at least one scope permission. */
  async execute(
    actor: Actor,
    query: { projectUuid?: string; periodDays: DashboardPeriod; scope?: DashboardScope },
  ): Promise<DashboardDTO> {
    actor.requireAll(['DEMAND_ACCESS', 'DASHBOARD_ACCESS']);
    const available = availableScopes(actor);
    if (available.length === 0) {
      throw DomainError.forbidden(
        'DASHBOARD_NO_SCOPE',
        'Seu perfil acessa a Dashboard, mas não possui permissão para visualizar indicadores.',
      );
    }
    const kind = query.scope ?? available[0]!;
    if (!available.includes(kind)) {
      throw DomainError.forbidden(
        'DASHBOARD_SCOPE_DENIED',
        kind === 'team'
          ? 'Seu perfil não possui permissão para visualizar os indicadores consolidados da equipe.'
          : 'Seu perfil não possui permissão para visualizar indicadores pessoais.',
      );
    }
    return this.compute(actor, { ...query, scope: kind }, available);
  }

  /**
   * The same reading for the assistant's reports, which are not the Dashboard screen: no
   * DASHBOARD_ACCESS required, but the scope rule still applies — without
   * DASHBOARD_VIEW_ALL the indicators it quotes are the person's own, never the team's.
   */
  async forAssistant(
    actor: Actor,
    query: { projectUuid?: string; periodDays: DashboardPeriod },
  ): Promise<DashboardDTO> {
    actor.require('DEMAND_ACCESS');
    const kind: DashboardScope = actor.can('DASHBOARD_VIEW_ALL') ? 'team' : 'personal';
    return this.compute(actor, { ...query, scope: kind }, [kind]);
  }

  private async compute(
    actor: Actor,
    query: { projectUuid?: string; periodDays: DashboardPeriod; scope: DashboardScope },
    available: DashboardScope[],
  ): Promise<DashboardDTO> {
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

    const personal = query.scope === 'personal';
    const [cards, projects] = await Promise.all([
      this.demands.listCards({
        restrictToProjectUuids: visible,
        // Team scope summarizes exactly what the board would list, so it obeys the same
        // DEMAND_VIEW_ALL rule. Personal scope is the actor's own responsibility, which
        // they can always read.
        restrictToOwnerUuid: personal || actor.canViewAllDemands() ? undefined : actor.userUuid.toString(),
        responsibleUuid: personal ? actor.userUuid : undefined,
        projectUuid,
        // Archived demands are off the board this dashboard describes: counting them made
        // work nobody can see on the Kanban show up as open, overdue or needing attention.
        archived: false,
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
      scope: {
        projectUuid: projectUuid ? projectUuid.toString() : null,
        kind: query.scope,
        available,
      },
    };
  }
}
