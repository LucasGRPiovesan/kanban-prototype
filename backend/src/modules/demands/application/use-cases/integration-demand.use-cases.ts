import { type LogActor } from '../../../../shared/application/activity-log.port';
import { type HtmlSanitizer } from '../../../../shared/application/html-sanitizer.port';
import { type UnitOfWork } from '../../../../shared/application/unit-of-work.port';
import { CalendarDate } from '../../../../shared/domain/calendar-date';
import { DomainError } from '../../../../shared/domain/errors';
import { Uuid } from '../../../../shared/domain/identifier';
import { AssigneeEligibility } from '../../domain/assignee-eligibility';
import { Demand } from '../../domain/demand';
import { RichText } from '../../domain/rich-text';
import { type DemandActivityLog } from '../demand-activity';
import { recordEdits } from './demand.use-cases';
import { type AssigneeDirectory, type DemandRepository } from '../ports/repositories';

/**
 * The write half of the demand-integration API.
 *
 * Deliberately not a thin wrapper around the session use cases: those start with
 * `actor.require(...)` and `DemandAccessGuard.loadAccessible`, both of which assume a
 * user session. Here the *credential* is the authorization — verified once, by
 * `AuthenticateIntegrationRequest`, before any of these run — so what is left is the
 * same domain rules (aggregate invariants, assignee eligibility) minus the permission
 * check, plus one isolation rule of their own: a demand belongs to the project its
 * credential was issued for, full stop, with no cross-project transfer surface at all.
 *
 * The subset of fields on offer mirrors the session API except for two intentional
 * omissions — no project transfer, no attachments or checklist — kept out until an
 * integration actually asks for them; see `docs/ADDED_REQUIREMENTS.md`.
 */

export interface CreateDemandViaIntegrationInput {
  title: string;
  description: string;
  dueDate: string;
  responsibleUuid: string;
  status?: string;
  priority?: string;
}

export interface UpdateDemandViaIntegrationInput {
  title?: string;
  description?: string;
  dueDate?: string;
  responsibleUuid?: string;
  priority?: string;
}

function parseUuid(value: string, code: string, message: string): Uuid {
  if (!Uuid.isValid(value)) {
    throw DomainError.notFound(code, message);
  }
  return Uuid.create(value);
}

/**
 * Loads a demand and enforces isolation the way `DemandAccessGuard` does for a user —
 * "not found", never "forbidden", so a credential can never learn that a uuid exists
 * in someone else's project.
 */
async function loadOwnDemand(
  demands: DemandRepository,
  projectUuid: Uuid,
  demandUuid: string,
): Promise<Demand> {
  const uuid = parseUuid(demandUuid, 'DEMAND_NOT_FOUND', 'Demanda não encontrada.');
  const demand = await demands.findByUuid(uuid);
  // A demand with no project belongs to no credential either: `null` matches nothing.
  if (!demand || !demand.projectUuid?.equals(projectUuid)) {
    throw DomainError.notFound('DEMAND_NOT_FOUND', 'Demanda não encontrada.');
  }
  return demand;
}

export class CreateDemandViaIntegration {
  constructor(
    private readonly demands: DemandRepository,
    private readonly assignees: AssigneeDirectory,
    private readonly sanitizer: HtmlSanitizer,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
  ) {}

  async execute(
    integrationActor: LogActor,
    projectUuid: Uuid,
    input: CreateDemandViaIntegrationInput,
  ): Promise<{ uuid: string }> {
    // Production is terminal and frozen: a demand born there could never be edited, and
    // would count as "delivered" without ever having gone through the flow — skewing
    // every lead-time and throughput metric on the Dashboard. The session API offers no
    // status at creation at all; the integration keeps the option, minus this one value.
    if (input.status === 'PRODUCTION') {
      throw DomainError.validation(
        'INTEGRATION_CANNOT_CREATE_IN_PRODUCTION',
        'Uma demanda não pode ser criada diretamente em produção: ela precisa percorrer o fluxo até lá.',
      );
    }

    const responsibleUuid = parseUuid(
      input.responsibleUuid,
      'RESPONSIBLE_NOT_FOUND',
      'Responsável não encontrado.',
    );
    const candidate = await this.assignees.findCandidate(projectUuid, responsibleUuid);
    AssigneeEligibility.assert(candidate);

    const demand = Demand.create({
      projectUuid,
      title: input.title,
      description: RichText.fromSanitizedHtml(this.sanitizer.sanitize(input.description)),
      dueDate: CalendarDate.fromISO(input.dueDate),
      responsibleUserUuid: candidate!.userUuid,
      // There is no human caller to attribute authorship to. The responsible — a real,
      // eligible member of the project either way — is the closest honest answer, the
      // same convention issue trackers use for tickets a bot files "on behalf of" someone.
      createdByUserUuid: candidate!.userUuid,
      status: input.status ? Demand.assertStatus(input.status) : undefined,
      priority: input.priority ? Demand.assertPriority(input.priority) : undefined,
    });

    const persisted = await this.uow.run(async () => {
      const created = await this.demands.create(demand);
      const card = await this.activity.snapshot(created.uuid);
      await this.activity.record(integrationActor, 'demand.created', card, {
        metadata: {
          status: card.status,
          priority: card.priority,
          responsible: card.responsible.name,
          dueDate: card.dueDate,
          source: 'integration',
        },
      });
      return created;
    });
    return { uuid: persisted.uuid.toString() };
  }
}

export class UpdateDemandViaIntegration {
  constructor(
    private readonly demands: DemandRepository,
    private readonly assignees: AssigneeDirectory,
    private readonly sanitizer: HtmlSanitizer,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
  ) {}

  async execute(
    integrationActor: LogActor,
    projectUuid: Uuid,
    demandUuid: string,
    input: UpdateDemandViaIntegrationInput,
  ): Promise<{ uuid: string }> {
    const demand = await loadOwnDemand(this.demands, projectUuid, demandUuid);
    const before = await this.activity.snapshot(demand.uuid);

    if (input.title !== undefined) {
      demand.changeTitle(input.title);
    }
    if (input.description !== undefined) {
      demand.changeDescription(RichText.fromSanitizedHtml(this.sanitizer.sanitize(input.description)));
    }
    if (input.dueDate !== undefined) {
      demand.changeDueDate(CalendarDate.fromISO(input.dueDate));
    }
    if (input.priority !== undefined) {
      demand.changePriority(Demand.assertPriority(input.priority));
    }
    if (input.responsibleUuid !== undefined) {
      const candidate = await this.assignees.findCandidate(
        projectUuid,
        parseUuid(input.responsibleUuid, 'RESPONSIBLE_NOT_FOUND', 'Responsável não encontrado.'),
      );
      AssigneeEligibility.assert(candidate);
      demand.assignResponsible(candidate!.userUuid);
    }

    await this.uow.run(async () => {
      await this.demands.update(demand);
      const after = await this.activity.snapshot(demand.uuid);
      // Same diff used by the session endpoint: title/description/dueDate become
      // `demand.updated`, a responsible change its own `demand.responsible_changed`.
      // `transferred` never fires here — there is no project field to change.
      await recordEdits(this.activity, integrationActor, before, after);
    });
    return { uuid: demand.uuid.toString() };
  }
}

export class MoveDemandViaIntegration {
  constructor(
    private readonly demands: DemandRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: DemandActivityLog,
  ) {}

  async execute(
    integrationActor: LogActor,
    projectUuid: Uuid,
    demandUuid: string,
    targetStatus: string,
  ): Promise<{ uuid: string; status: string }> {
    const demand = await loadOwnDemand(this.demands, projectUuid, demandUuid);
    const from = demand.status;
    demand.moveTo(Demand.assertStatus(targetStatus));

    // Dropping a card back into its own column changes nothing, and nothing is not an
    // event — identical rule to the session-driven Kanban move.
    if (demand.status === from) {
      return { uuid: demand.uuid.toString(), status: demand.status };
    }

    await this.uow.run(async () => {
      await this.demands.update(demand);
      await this.activity.record(
        integrationActor,
        'demand.status_changed',
        await this.activity.snapshot(demand.uuid),
        { changes: [{ field: 'status', from, to: demand.status }], metadata: { source: 'integration' } },
      );
    });
    return { uuid: demand.uuid.toString(), status: demand.status };
  }
}
