import { beforeEach, describe, expect, it } from 'vitest';
import { Actor } from '../../src/shared/application/actor';
import { CalendarDate } from '../../src/shared/domain/calendar-date';
import { DomainError } from '../../src/shared/domain/errors';
import { Uuid } from '../../src/shared/domain/identifier';
import { PermissionSet } from '../../src/modules/iam/domain/permission-set';
import { ProjectAccessResolver } from '../../src/modules/projects/application/use-cases/project.use-cases';
import type {
  ProjectMemberRepository,
  ProjectMemberView,
} from '../../src/modules/projects/application/ports/repositories';
import { Demand } from '../../src/modules/demands/domain/demand';
import { RichText } from '../../src/modules/demands/domain/rich-text';
import type { AssigneeCandidate } from '../../src/modules/demands/domain/assignee-eligibility';
import type {
  AssigneeDirectory,
  DemandCardView,
  DemandQueries,
  DemandRepository,
} from '../../src/modules/demands/application/ports/repositories';
import {
  CreateDemand,
  DemandAccessGuard,
  MoveDemand,
  UpdateDemand,
} from '../../src/modules/demands/application/use-cases/demand.use-cases';
import { DemandActivityLog } from '../../src/modules/demands/application/demand-activity';
import type {
  ActivityRecord,
  ActivityRecorder,
  LogActor,
} from '../../src/shared/application/activity-log.port';

/**
 * In-memory doubles.
 *
 * Because the use cases depend on ports rather than on Prisma, the whole application
 * layer is testable without a database — which is the practical payoff of the
 * dependency inversion, not just an architectural nicety.
 */

const PROJECT_A = Uuid.generate();
const PROJECT_B = Uuid.generate();
const RESPONSIBLE = Uuid.generate();

class InMemoryDemandRepository implements DemandRepository {
  readonly demands = new Map<string, Demand>();

  async findByUuid(uuid: Uuid): Promise<Demand | null> {
    return this.demands.get(uuid.toString()) ?? null;
  }
  async create(demand: Demand): Promise<Demand> {
    this.demands.set(demand.uuid.toString(), demand);
    return demand;
  }
  async update(demand: Demand): Promise<Demand> {
    this.demands.set(demand.uuid.toString(), demand);
    return demand;
  }
  async delete(uuid: Uuid): Promise<void> {
    this.demands.delete(uuid.toString());
  }
}

class InMemoryMemberRepository implements ProjectMemberRepository {
  constructor(private readonly membership: Record<string, string[]> = {}) {}

  async listProjectUuidsOfUser(userUuid: Uuid): Promise<string[]> {
    return this.membership[userUuid.toString()] ?? [];
  }
  async listMembers(): Promise<ProjectMemberView[]> {
    return [];
  }
  async listMemberSummaries(): Promise<Map<string, never[]>> {
    return new Map();
  }
  async isMember(projectUuid: Uuid, userUuid: Uuid): Promise<boolean> {
    return (this.membership[userUuid.toString()] ?? []).includes(projectUuid.toString());
  }
  async add(): Promise<void> {}
  async remove(): Promise<void> {}
  async replaceMembers(): Promise<void> {}
  async countDemandsOfMember(): Promise<number> {
    return 0;
  }
}

class StubAssigneeDirectory implements AssigneeDirectory {
  constructor(private readonly candidate: AssigneeCandidate | null) {}

  async findCandidate(): Promise<AssigneeCandidate | null> {
    return this.candidate;
  }
  async listEligible(): Promise<{ uuid: string; name: string; avatarUrl: string | null }[]> {
    return [];
  }
}

/**
 * Pass-through sanitizer. These tests are about orchestration; what the allowlist
 * actually strips is verified against the real adapter in its own suite.
 */
const passthroughSanitizer = { sanitize: (html: string) => html };

/** Runs the work directly: atomicity is the database's job, verified by the API suite. */
const immediateUow = { run: <T>(work: () => Promise<T>) => work() };

/** Captures what a use case records, so the recording contract is testable without a database. */
class RecordingActivity implements ActivityRecorder {
  readonly entries: { actor: LogActor | null; record: ActivityRecord }[] = [];

  async record(actor: LogActor | null, record: ActivityRecord): Promise<void> {
    this.entries.push({ actor, record });
  }
}

/** Read model derived from the in-memory aggregates, with fixed display names. */
class InMemoryDemandQueries implements DemandQueries {
  constructor(private readonly repo: InMemoryDemandRepository) {}

  async listCards(): Promise<DemandCardView[]> {
    return [...this.repo.demands.values()].map((demand) => this.toCard(demand));
  }

  async findCard(uuid: Uuid): Promise<DemandCardView | null> {
    const demand = this.repo.demands.get(uuid.toString());
    return demand ? this.toCard(demand) : null;
  }

  async listCardsPage(
    _filter: unknown,
    page: { page: number; limit: number },
  ): Promise<{ items: DemandCardView[]; total: number }> {
    const cards = (await this.listCards())
      .map((card) => ({ card, dueDate: new Date(card.dueDate) }))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.card.uuid.localeCompare(b.card.uuid));

    const start = (page.page - 1) * page.limit;
    const items = cards.slice(start, start + page.limit).map(({ card }) => card);

    return { items, total: cards.length };
  }

  async responsiblesSeen(): Promise<{ uuid: string; name: string }[]> {
    return [];
  }

  private toCard(demand: Demand): DemandCardView {
    return {
      uuid: demand.uuid.toString(),
      title: demand.title,
      description: demand.description.toString(),
      status: demand.status,
      priority: demand.priority,
      dueDate: demand.dueDate.toISO(),
      project: demand.projectUuid
        ? { uuid: demand.projectUuid.toString(), name: 'Projeto de Teste' }
        : null,
      responsible: {
        uuid: demand.responsibleUserUuid.toString(),
        name: 'Lucas Barbosa',
        avatarUrl: null,
        active: true,
        deletedAt: null,
      },
      createdBy: { uuid: demand.createdByUserUuid.toString(), name: 'Mariana Alves' },
      attachmentCount: demand.attachments.length,
      previewThumbnailKey: null,
      checklist: demand.checklist.map((item) => ({
        uuid: item.uuid.toString(),
        title: item.title,
        done: item.done,
        position: item.position,
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
      archived: demand.archived,
    };
  }
}

function activityOf(repo: InMemoryDemandRepository, recorder: ActivityRecorder = new RecordingActivity()) {
  return new DemandActivityLog(new InMemoryDemandQueries(repo), recorder);
}

/**
 * DEMAND_VIEW_ALL is added unless the caller already named it, because every test here
 * is about something else — moving a card, transferring a project, creating with a
 * status — and none of them is about whose demand it is. Leaving it out would make each
 * of them silently depend on the test actor happening to be the demand's responsible,
 * which is exactly the kind of accidental coupling that makes a suite brittle. The rule
 * itself is asserted on its own, with `actorWithoutViewAll`, further down.
 */
function actor(userUuid: Uuid, permissions: string[]): Actor {
  return actorWithoutViewAll(userUuid, [...permissions, 'DEMAND_VIEW_ALL']);
}

function actorWithoutViewAll(userUuid: Uuid, permissions: string[]): Actor {
  return new Actor(userUuid, 'Tester', Uuid.generate(), 'tester', 'Perfil de Teste', PermissionSet.fromCodes(permissions));
}

const eligible: AssigneeCandidate = {
  userUuid: RESPONSIBLE,
  name: 'Lucas Barbosa',
  active: true,
  requiresMembership: true,
  isProjectMember: true,
  canBeAssignee: true,
};

function seedDemand(
  repo: InMemoryDemandRepository,
  status: Parameters<Demand['moveTo']>[0],
  project: Uuid | null = PROJECT_A,
) {
  const demand = Demand.create({
    projectUuid: project,
    title: 'Demanda de teste',
    description: RichText.fromSanitizedHtml('<p>Descrição da demanda de teste.</p>'),
    dueDate: CalendarDate.fromISO('2026-12-01'),
    responsibleUserUuid: RESPONSIBLE,
    createdByUserUuid: Uuid.generate(),
    status,
  });
  repo.demands.set(demand.uuid.toString(), demand);
  return demand;
}

/**
 * Whose demands an actor may read.
 *
 * Two rules stack, and they answer different questions: project allocation decides
 * *where* someone may act, DEMAND_VIEW_ALL decides *whose work* they may see inside it.
 * The tests below fix the second one, including the case the first cannot express —
 * a demand attached to no project at all, where allocation has nothing to say.
 */
describe('Demand visibility without DEMAND_VIEW_ALL', () => {
  const READER = Uuid.generate();
  let repo: InMemoryDemandRepository;
  let guard: DemandAccessGuard;

  beforeEach(() => {
    repo = new InMemoryDemandRepository();
    const members = new InMemoryMemberRepository({ [READER.toString()]: [PROJECT_A.toString()] });
    guard = new DemandAccessGuard(repo, new ProjectAccessResolver(members));
  });

  const reader = (extra: string[] = []) =>
    actorWithoutViewAll(READER, ['DEMAND_ACCESS', 'PROJECT_ACCESS', ...extra]);

  it('refuses a demand of someone else, even inside a project the actor belongs to', async () => {
    const demand = seedDemand(repo, 'IN_PROGRESS');
    await expect(
      guard.loadAccessible(reader(), demand.uuid.toString()),
    ).rejects.toMatchObject({ code: 'DEMAND_NOT_FOUND' });
  });

  it('allows a demand the actor is responsible for', async () => {
    const demand = seedDemand(repo, 'IN_PROGRESS');
    demand.assignResponsible(READER);
    await expect(guard.loadAccessible(reader(), demand.uuid.toString())).resolves.toBeDefined();
  });

  /**
   * Someone who may create demands but never hold one would otherwise lose sight of
   * their own the instant they saved it.
   */
  it('allows a demand the actor created but does not hold', async () => {
    const demand = Demand.create({
      projectUuid: PROJECT_A,
      title: 'Demanda criada pelo leitor',
      description: RichText.fromSanitizedHtml('<p>Descrição da demanda.</p>'),
      dueDate: CalendarDate.fromISO('2026-12-01'),
      responsibleUserUuid: RESPONSIBLE,
      createdByUserUuid: READER,
    });
    repo.demands.set(demand.uuid.toString(), demand);

    await expect(guard.loadAccessible(reader(), demand.uuid.toString())).resolves.toBeDefined();
  });

  it('refuses a project-less demand of someone else', async () => {
    const demand = seedDemand(repo, 'IN_PROGRESS', null);
    await expect(
      guard.loadAccessible(reader(), demand.uuid.toString()),
    ).rejects.toMatchObject({ code: 'DEMAND_NOT_FOUND' });
  });

  it('allows the same project-less demand once DEMAND_VIEW_ALL is granted', async () => {
    const demand = seedDemand(repo, 'IN_PROGRESS', null);
    await expect(
      guard.loadAccessible(
        actor(READER, ['DEMAND_ACCESS', 'PROJECT_ACCESS']),
        demand.uuid.toString(),
      ),
    ).resolves.toBeDefined();
  });
});

describe('MoveDemand', () => {
  let repo: InMemoryDemandRepository;
  let memberUuid: Uuid;
  let guard: DemandAccessGuard;
  let moveDemand: MoveDemand;
  let recorder: RecordingActivity;

  beforeEach(() => {
    repo = new InMemoryDemandRepository();
    memberUuid = Uuid.generate();
    const members = new InMemoryMemberRepository({ [memberUuid.toString()]: [PROJECT_A.toString()] });
    guard = new DemandAccessGuard(repo, new ProjectAccessResolver(members));
    recorder = new RecordingActivity();
    moveDemand = new MoveDemand(guard, repo, immediateUow, activityOf(repo, recorder));
  });

  it('records the move with where it came from and where it went', async () => {
    const demand = seedDemand(repo, 'IN_PROGRESS');
    await moveDemand.execute(
      actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS']),
      demand.uuid.toString(),
      'IN_REVIEW',
    );

    expect(recorder.entries).toHaveLength(1);
    const [{ actor: author, record }] = recorder.entries as [(typeof recorder.entries)[number]];
    expect(author).toEqual({ uuid: memberUuid.toString(), name: 'Tester' });
    expect(record.action).toBe('demand.status_changed');
    expect(record.changes).toEqual([{ field: 'status', from: 'IN_PROGRESS', to: 'IN_REVIEW' }]);
    expect(record.subject).toEqual({ type: 'DEMAND', uuid: demand.uuid.toString(), label: demand.title });
    // Project-scoped: without it the entry would be invisible to the project's members.
    expect(record.project?.uuid).toBe(PROJECT_A.toString());
  });

  it('records nothing when the rules refuse the move', async () => {
    const demand = seedDemand(repo, 'PRODUCTION');
    await expect(
      moveDemand.execute(
        actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS']),
        demand.uuid.toString(),
        'IN_PROGRESS',
      ),
    ).rejects.toMatchObject({ code: 'DEMAND_IN_PRODUCTION_IS_TERMINAL' });
    expect(recorder.entries).toHaveLength(0);
  });

  it('records nothing when a card is dropped back into its own column', async () => {
    const demand = seedDemand(repo, 'PAUSED');
    await moveDemand.execute(
      actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS']),
      demand.uuid.toString(),
      'PAUSED',
    );
    expect(recorder.entries).toHaveLength(0);
  });

  it('moves a demand within the actor own project', async () => {
    const demand = seedDemand(repo, 'NOT_STARTED');
    const result = await moveDemand.execute(
      actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS']),
      demand.uuid.toString(),
      'IN_PROGRESS',
    );
    expect(result.status).toBe('IN_PROGRESS');
  });

  it('refuses to move a demand in production', async () => {
    const demand = seedDemand(repo, 'PRODUCTION');
    await expect(
      moveDemand.execute(
        actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS']),
        demand.uuid.toString(),
        'IN_PROGRESS',
      ),
    ).rejects.toMatchObject({ code: 'DEMAND_IN_PRODUCTION_IS_TERMINAL' });
  });

  it('lets DEMAND_MANAGE_PRODUCTION move a demand back out of production', async () => {
    const demand = seedDemand(repo, 'PRODUCTION');
    const result = await moveDemand.execute(
      actor(memberUuid, [
        'DEMAND_ACCESS',
        'DEMAND_UPDATE',
        'DEMAND_MANAGE_PRODUCTION',
        'PROJECT_ACCESS',
      ]),
      demand.uuid.toString(),
      'IN_PROGRESS',
    );
    expect(result.status).toBe('IN_PROGRESS');
    expect(recorder.entries).toHaveLength(1);
  });

  it('lets anyone with DEMAND_UPDATE enter production — no extra permission required', async () => {
    const demand = seedDemand(repo, 'NOT_STARTED');
    const result = await moveDemand.execute(
      actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS']),
      demand.uuid.toString(),
      'PRODUCTION',
    );
    expect(result.status).toBe('PRODUCTION');
  });

  it('refuses without DEMAND_UPDATE — the Administrador case', async () => {
    const demand = seedDemand(repo, 'NOT_STARTED');
    await expect(
      moveDemand.execute(
        actor(memberUuid, ['DEMAND_ACCESS', 'PROJECT_ACCESS', 'PROJECT_ACCESS_ALL']),
        demand.uuid.toString(),
        'IN_PROGRESS',
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('hides a demand belonging to a project the actor is not allocated to', async () => {
    const demand = seedDemand(repo, 'NOT_STARTED', PROJECT_B);
    await expect(
      moveDemand.execute(
        actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS']),
        demand.uuid.toString(),
        'IN_PROGRESS',
      ),
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('lets PROJECT_ACCESS_ALL reach a project without membership', async () => {
    const demand = seedDemand(repo, 'NOT_STARTED', PROJECT_B);
    const result = await moveDemand.execute(
      actor(Uuid.generate(), ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS', 'PROJECT_ACCESS_ALL']),
      demand.uuid.toString(),
      'PAUSED',
    );
    expect(result.status).toBe('PAUSED');
  });
});

describe('CreateDemand', () => {
  const memberUuid = Uuid.generate();
  const members = new InMemoryMemberRepository({ [memberUuid.toString()]: [PROJECT_A.toString()] });
  const access = new ProjectAccessResolver(members);

  const input = {
    projectUuid: PROJECT_A.toString(),
    title: 'Nova demanda',
    description: 'Descrição suficiente.',
    dueDate: '2026-12-01',
    responsibleUuid: RESPONSIBLE.toString(),
  };

  it('creates a demand with an eligible responsible', async () => {
    const repo = new InMemoryDemandRepository();
    const useCase = new CreateDemand(
      repo,
      new StubAssigneeDirectory(eligible),
      access,
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );

    const result = await useCase.execute(
      actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_CREATE', 'PROJECT_ACCESS']),
      input,
    );

    expect(repo.demands.size).toBe(1);
    expect(Uuid.isValid(result.uuid)).toBe(true);
  });

  it('starts a new demand in NOT_STARTED', async () => {
    const repo = new InMemoryDemandRepository();
    const useCase = new CreateDemand(
      repo,
      new StubAssigneeDirectory(eligible),
      access,
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );

    const { uuid } = await useCase.execute(
      actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_CREATE', 'PROJECT_ACCESS']),
      input,
    );
    expect(repo.demands.get(uuid)?.status).toBe('NOT_STARTED');
  });

  it('starts a demand directly in the requested column, for someone holding DEMAND_CREATE_WITH_STATUS', async () => {
    const repo = new InMemoryDemandRepository();
    const useCase = new CreateDemand(
      repo,
      new StubAssigneeDirectory(eligible),
      access,
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );

    const { uuid } = await useCase.execute(
      actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_CREATE', 'DEMAND_CREATE_WITH_STATUS', 'PROJECT_ACCESS']),
      { ...input, status: 'IN_REVIEW' },
    );
    expect(repo.demands.get(uuid)?.status).toBe('IN_REVIEW');
  });

  it('refuses any explicit status without DEMAND_CREATE_WITH_STATUS — the Administrador case', async () => {
    const repo = new InMemoryDemandRepository();
    const useCase = new CreateDemand(
      repo,
      new StubAssigneeDirectory(eligible),
      access,
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );
    const withoutIt = actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_CREATE', 'PROJECT_ACCESS']);

    await expect(
      useCase.execute(withoutIt, { ...input, status: 'IN_PROGRESS' }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    // Even the harmless value: the permission gates the field itself, not just the
    // columns that would otherwise need DEMAND_UPDATE too.
    await expect(
      useCase.execute(withoutIt, { ...input, status: 'NOT_STARTED' }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(repo.demands.size).toBe(0);
  });

  it('never creates a demand already in production, even with DEMAND_CREATE_WITH_STATUS', async () => {
    const repo = new InMemoryDemandRepository();
    const useCase = new CreateDemand(
      repo,
      new StubAssigneeDirectory(eligible),
      access,
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );

    await expect(
      useCase.execute(
        actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_CREATE', 'DEMAND_CREATE_WITH_STATUS', 'PROJECT_ACCESS']),
        { ...input, status: 'PRODUCTION' },
      ),
    ).rejects.toMatchObject({ code: 'DEMAND_CANNOT_CREATE_IN_PRODUCTION' });
    expect(repo.demands.size).toBe(0);
  });

  it('refuses a responsible who is not a member of the project', async () => {
    const repo = new InMemoryDemandRepository();
    const useCase = new CreateDemand(
      repo,
      new StubAssigneeDirectory({ ...eligible, isProjectMember: false }),
      access,
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );

    await expect(
      useCase.execute(actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_CREATE', 'PROJECT_ACCESS']), input),
    ).rejects.toMatchObject({ code: 'RESPONSIBLE_NOT_PROJECT_MEMBER' });
    expect(repo.demands.size).toBe(0);
  });

  it('refuses a responsible whose profile cannot take demands', async () => {
    const repo = new InMemoryDemandRepository();
    const useCase = new CreateDemand(
      repo,
      new StubAssigneeDirectory({ ...eligible, canBeAssignee: false }),
      access,
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );

    await expect(
      useCase.execute(actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_CREATE', 'PROJECT_ACCESS']), input),
    ).rejects.toMatchObject({ code: 'RESPONSIBLE_CANNOT_BE_ASSIGNEE' });
  });

  it('refuses without DEMAND_CREATE', async () => {
    const repo = new InMemoryDemandRepository();
    const useCase = new CreateDemand(
      repo,
      new StubAssigneeDirectory(eligible),
      access,
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );

    await expect(
      useCase.execute(actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS']), input),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('refuses to create in a project the actor cannot reach', async () => {
    const repo = new InMemoryDemandRepository();
    const useCase = new CreateDemand(
      repo,
      new StubAssigneeDirectory(eligible),
      access,
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );

    await expect(
      useCase.execute(actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_CREATE', 'PROJECT_ACCESS']), {
        ...input,
        projectUuid: PROJECT_B.toString(),
      }),
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('rejects an impossible calendar date', async () => {
    const repo = new InMemoryDemandRepository();
    const useCase = new CreateDemand(
      repo,
      new StubAssigneeDirectory(eligible),
      access,
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );

    await expect(
      useCase.execute(actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_CREATE', 'PROJECT_ACCESS']), {
        ...input,
        dueDate: '2026-02-31',
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe('UpdateDemand', () => {
  const memberUuid = Uuid.generate();
  const members = new InMemoryMemberRepository({ [memberUuid.toString()]: [PROJECT_A.toString()] });

  it('updates the fields of an accessible demand', async () => {
    const repo = new InMemoryDemandRepository();
    const demand = seedDemand(repo, 'IN_PROGRESS');
    const guard = new DemandAccessGuard(repo, new ProjectAccessResolver(members));
    const useCase = new UpdateDemand(
      guard,
      repo,
      new StubAssigneeDirectory(eligible),
      new ProjectAccessResolver(members),
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );

    await useCase.execute(
      actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS']),
      demand.uuid.toString(),
      { title: 'Título revisado' },
    );

    expect(repo.demands.get(demand.uuid.toString())?.title).toBe('Título revisado');
  });

  it('refuses to edit a demand in production', async () => {
    const repo = new InMemoryDemandRepository();
    const demand = seedDemand(repo, 'PRODUCTION');
    const guard = new DemandAccessGuard(repo, new ProjectAccessResolver(members));
    const useCase = new UpdateDemand(
      guard,
      repo,
      new StubAssigneeDirectory(eligible),
      new ProjectAccessResolver(members),
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );

    await expect(
      useCase.execute(
        actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS']),
        demand.uuid.toString(),
        { title: 'Novo título' },
      ),
    ).rejects.toMatchObject({ code: 'DEMAND_IN_PRODUCTION_IS_TERMINAL' });
  });

  it('refuses without DEMAND_UPDATE', async () => {
    const repo = new InMemoryDemandRepository();
    const demand = seedDemand(repo, 'NOT_STARTED');
    const guard = new DemandAccessGuard(repo, new ProjectAccessResolver(members));
    const useCase = new UpdateDemand(
      guard,
      repo,
      new StubAssigneeDirectory(eligible),
      new ProjectAccessResolver(members),
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );

    await expect(
      useCase.execute(
        actor(memberUuid, ['DEMAND_ACCESS', 'PROJECT_ACCESS']),
        demand.uuid.toString(),
        { title: 'Novo título' },
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});

/**
 * The four field-level capabilities. Each is checked independently, before anything
 * mutates: DEMAND_UPDATE alone still covers title, description and status, exactly the
 * "updates the fields of an accessible demand" case above with nothing more than that.
 */
describe('UpdateDemand — field-level capabilities', () => {
  const memberUuid = Uuid.generate();
  const members = new InMemoryMemberRepository({ [memberUuid.toString()]: [PROJECT_A.toString()] });

  function buildUseCase(repo: InMemoryDemandRepository) {
    return new UpdateDemand(
      new DemandAccessGuard(repo, new ProjectAccessResolver(members)),
      repo,
      new StubAssigneeDirectory(eligible),
      new ProjectAccessResolver(members),
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );
  }

  const cases: {
    field: string;
    permission: string;
    input: Record<string, unknown>;
  }[] = [
    { field: 'priority', permission: 'DEMAND_UPDATE_PRIORITY', input: { priority: 'HIGH' } },
    { field: 'dueDate', permission: 'DEMAND_UPDATE_DUE_DATE', input: { dueDate: '2026-12-24' } },
    {
      field: 'responsibleUuid',
      permission: 'DEMAND_UPDATE_RESPONSIBLE',
      input: { responsibleUuid: RESPONSIBLE.toString() },
    },
    { field: 'projectUuid', permission: 'DEMAND_UPDATE_PROJECT', input: { projectUuid: PROJECT_A.toString() } },
  ];

  for (const { field, permission, input } of cases) {
    it(`refuses to change ${field} with DEMAND_UPDATE alone, lacking ${permission}`, async () => {
      const repo = new InMemoryDemandRepository();
      const demand = seedDemand(repo, 'IN_PROGRESS');
      const useCase = buildUseCase(repo);

      await expect(
        useCase.execute(
          actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS']),
          demand.uuid.toString(),
          input,
        ),
      ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    });

    it(`allows changing ${field} once ${permission} is granted`, async () => {
      const repo = new InMemoryDemandRepository();
      const demand = seedDemand(repo, 'IN_PROGRESS');
      const useCase = buildUseCase(repo);

      await expect(
        useCase.execute(
          actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS', permission]),
          demand.uuid.toString(),
          input,
        ),
      ).resolves.toMatchObject({ uuid: demand.uuid.toString() });
    });
  }

  it('changes title and description with plain DEMAND_UPDATE, none of the four field permissions', async () => {
    const repo = new InMemoryDemandRepository();
    const demand = seedDemand(repo, 'IN_PROGRESS');
    const useCase = buildUseCase(repo);

    await useCase.execute(
      actor(memberUuid, ['DEMAND_ACCESS', 'DEMAND_UPDATE', 'PROJECT_ACCESS']),
      demand.uuid.toString(),
      { title: 'Recalcular rota', description: 'Descrição revisada.' },
    );

    const updated = repo.demands.get(demand.uuid.toString());
    expect(updated?.title).toBe('Recalcular rota');
  });

  it('moving the project without an explicit responsible needs only DEMAND_UPDATE_PROJECT', async () => {
    // The responsible is re-validated against the destination either way (allocation is
    // per project), but that re-check is not the actor *choosing* a new responsible —
    // only an explicit `responsibleUuid` in the request should ask for that permission.
    const repo = new InMemoryDemandRepository();
    const demand = seedDemand(repo, 'IN_PROGRESS', PROJECT_A);
    const membersOfBoth = new InMemoryMemberRepository({
      [memberUuid.toString()]: [PROJECT_A.toString(), PROJECT_B.toString()],
    });
    const useCase = new UpdateDemand(
      new DemandAccessGuard(repo, new ProjectAccessResolver(membersOfBoth)),
      repo,
      // The existing responsible is eligible in the destination too, so no
      // RESPONSIBLE_NOT_PROJECT_MEMBER rejection gets in the way of the permission check.
      new StubAssigneeDirectory({ ...eligible, userUuid: RESPONSIBLE }),
      new ProjectAccessResolver(membersOfBoth),
      passthroughSanitizer,
      immediateUow,
      activityOf(repo),
    );

    await expect(
      useCase.execute(
        actor(memberUuid, [
          'DEMAND_ACCESS',
          'DEMAND_UPDATE',
          'PROJECT_ACCESS',
          'DEMAND_UPDATE_PROJECT',
        ]),
        demand.uuid.toString(),
        { projectUuid: PROJECT_B.toString() },
      ),
    ).resolves.toMatchObject({ uuid: demand.uuid.toString() });
  });
});
