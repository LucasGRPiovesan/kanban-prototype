import { createHash } from 'node:crypto';
import { type FieldChange } from '../src/shared/application/activity-log.port';
import {
  type ActivityAction,
  type LogCategory,
  type LogLevel,
  type LogSubjectType,
  type SystemEventCode,
  logActionDefinition,
  scopeOf,
} from '../src/shared/domain/activity-catalog';
import { demandState } from '../src/modules/demands/domain/demand-status';
import { summarizeActivity } from '../src/modules/logs/application/summarize';
import {
  SEED_COMMENTS,
  SEED_DEMANDS,
  SEED_PROJECTS,
  SEED_USERS,
  SEED_UUIDS,
  SYSTEM_ROLES,
  type SeedDemand,
  demandUuidOf,
} from './seed-data';

/**
 * `5eed` as the first hex digits. A UUID v7 starts with its millisecond timestamp, which
 * will not reach 0x5eed… for thousands of years — so this prefix can never collide with a
 * row the application writes, and the seed can prune its own rows by it.
 */
export const SEED_UUID_PREFIX = '5eed';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type UserKey = keyof typeof SEED_UUIDS.users;
type ProjectKey = keyof typeof SEED_UUIDS.projects;

export interface SeedLogEntry {
  uuid: string;
  key: string;
  occurredAt: Date;
  category: LogCategory;
  level: LogLevel;
  action: string;
  summary: string;
  actor: { uuid: string; name: string } | null;
  /** For validation only: the seeded identity behind `actor`. */
  actorKey: UserKey | null;
  subject: { type: LogSubjectType; uuid: string; label: string | null } | null;
  project: { uuid: string; name: string } | null;
  projectKey: ProjectKey | null;
  changes: FieldChange[] | null;
  metadata: Record<string, unknown> | null;
}

export interface SeedCommentEntry {
  uuid: string;
  key: string;
  demandUuid: string;
  demandKey: string;
  authorUuid: string;
  authorKey: UserKey;
  body: string;
  createdAt: Date;
}

export interface SeedActivity {
  now: Date;
  logs: SeedLogEntry[];
  comments: SeedCommentEntry[];
  /** When each seeded demand came into being, so the row agrees with its history. */
  demandCreatedAt: Map<string, Date>;
}

/** Deterministic uuid from a stable key, inside the seed's prefix. */
export function seedUuid(key: string): string {
  const hex = createHash('sha1').update(key).digest('hex');
  return `${SEED_UUID_PREFIX}${hex.slice(0, 4)}-${hex.slice(4, 8)}-4${hex.slice(9, 12)}-9${hex.slice(13, 16)}-${hex.slice(16, 28)}`;
}

/** The path a demand takes from creation to its seeded status, in board order. */
const STATUS_PATHS: Record<SeedDemand['status'], SeedDemand['status'][]> = {
  NOT_STARTED: [],
  IN_PROGRESS: ['IN_PROGRESS'],
  PAUSED: ['IN_PROGRESS', 'PAUSED'],
  IN_REVIEW: ['IN_PROGRESS', 'IN_REVIEW'],
  PRODUCTION: ['IN_PROGRESS', 'IN_REVIEW', 'PRODUCTION'],
};

/** Every seeded demand is created by the first administrator — see seed.ts. */
const DEMAND_CREATOR: UserKey = 'marianaAlves';

function userOf(key: UserKey) {
  const user = SEED_USERS.find((candidate) => candidate.uuid === SEED_UUIDS.users[key])!;
  return { uuid: user.uuid, name: user.name };
}

function projectOf(key: ProjectKey) {
  const project = SEED_PROJECTS.find((candidate) => candidate.uuid === SEED_UUIDS.projects[key])!;
  return { uuid: project.uuid, name: project.name };
}

function membersOf(key: ProjectKey): readonly UserKey[] {
  return SEED_PROJECTS.find((project) => project.uuid === SEED_UUIDS.projects[key])!.members as readonly UserKey[];
}

function roleOf(key: UserKey) {
  const slug = SEED_USERS.find((user) => user.uuid === SEED_UUIDS.users[key])!.role;
  return SYSTEM_ROLES.find((role) => role.slug === slug)!;
}

function holds(key: UserKey, permission: string): boolean {
  return (roleOf(key).permissions as readonly string[]).includes(permission);
}

export function buildSeedActivity(now: Date): SeedActivity {
  const logs: SeedLogEntry[] = [];
  const comments: SeedCommentEntry[] = [];
  const demandCreatedAt = new Map<string, Date>();
  const at = (offsetMs: number) => new Date(now.getTime() - offsetMs);

  const activity = (input: {
    key: string;
    action: ActivityAction;
    occurredAt: Date;
    actor: UserKey | null;
    subject: { type: LogSubjectType; uuid: string; label: string };
    project?: ProjectKey | null;
    changes?: FieldChange[];
    metadata?: Record<string, unknown>;
  }) => {
    const project = input.project ? projectOf(input.project) : null;
    logs.push({
      uuid: seedUuid(`log:${input.key}`),
      key: input.key,
      occurredAt: input.occurredAt,
      category: 'ACTIVITY',
      level: logActionDefinition(input.action)!.level,
      action: input.action,
      summary: summarizeActivity({
        action: input.action,
        subject: input.subject,
        project,
        changes: input.changes,
        metadata: input.metadata,
      }),
      actor: input.actor ? userOf(input.actor) : null,
      actorKey: input.actor,
      subject: input.subject,
      project,
      projectKey: input.project ?? null,
      changes: input.changes ?? null,
      metadata: input.metadata ?? null,
    });
  };

  const system = (input: {
    key: string;
    code: SystemEventCode;
    occurredAt: Date;
    actor: UserKey;
    subject: { type: LogSubjectType; uuid: string; label: string };
    message: string;
    metadata: Record<string, unknown>;
  }) => {
    logs.push({
      uuid: seedUuid(`log:${input.key}`),
      key: input.key,
      occurredAt: input.occurredAt,
      category: 'SYSTEM',
      level: logActionDefinition(input.code)!.level,
      action: input.code,
      summary: input.message,
      actor: userOf(input.actor),
      actorKey: input.actor,
      subject: input.subject,
      project: null,
      projectKey: null,
      changes: null,
      metadata: input.metadata,
    });
  };

  // --- Organization bootstrap: the installation creates the profiles and first admin --
  SYSTEM_ROLES.forEach((role, index) => {
    activity({
      key: `role:${role.slug}:created`,
      action: 'role.created',
      occurredAt: at(60 * DAY - index * 60_000),
      actor: null,
      subject: { type: 'ROLE', uuid: role.uuid, label: role.name },
      metadata: { permissions: [...role.permissions] },
    });
  });

  SEED_USERS.forEach((user, index) => {
    const isFirstAdmin = user.uuid === SEED_UUIDS.users.marianaAlves;
    activity({
      key: `user:${user.uuid}:created`,
      action: 'user.created',
      occurredAt: isFirstAdmin ? at(60 * DAY - 10 * 60_000) : at(59 * DAY - index * HOUR),
      // Every other account is created by the first administrator, who holds USER_CREATE.
      actor: isFirstAdmin ? null : 'marianaAlves',
      subject: { type: 'USER', uuid: user.uuid, label: user.name },
      metadata: { role: SYSTEM_ROLES.find((role) => role.slug === user.role)!.name },
    });
  });

  SEED_PROJECTS.forEach((project, projectIndex) => {
    const key = (Object.keys(SEED_UUIDS.projects) as ProjectKey[]).find(
      (candidate) => SEED_UUIDS.projects[candidate] === project.uuid,
    )!;
    const createdAt = 45 * DAY - projectIndex * HOUR;
    activity({
      key: `project:${key}:created`,
      action: 'project.created',
      occurredAt: at(createdAt),
      actor: 'marianaAlves',
      subject: { type: 'PROJECT', uuid: project.uuid, label: project.name },
      project: key,
      metadata: { description: project.description },
    });
    (project.members as readonly UserKey[]).forEach((member, memberIndex) => {
      activity({
        key: `project:${key}:member:${member}`,
        action: 'project.member_added',
        occurredAt: at(44 * DAY - projectIndex * HOUR - memberIndex * 60_000),
        actor: 'marianaAlves',
        subject: { type: 'PROJECT', uuid: project.uuid, label: project.name },
        project: key,
        metadata: { member: userOf(member) },
      });
    });
  });

  // --- Demands: creation, the path to the seeded status, and checklist progress -------
  SEED_DEMANDS.forEach((demand, index) => {
    const uuid = demandUuidOf(demand.key);
    const subject = { type: 'DEMAND' as const, uuid, label: demand.title };
    const project = demand.project as ProjectKey;
    const responsible = demand.responsible as UserKey;

    const ageDays = 20 + (index % 7);
    const createdOffset = ageDays * DAY + index * 13 * 60_000;
    const createdAt = at(createdOffset);
    demandCreatedAt.set(uuid, createdAt);

    activity({
      key: `demand:${demand.key}:created`,
      action: 'demand.created',
      occurredAt: createdAt,
      actor: DEMAND_CREATOR,
      subject,
      project,
      metadata: {
        status: 'NOT_STARTED',
        responsible: userOf(responsible).name,
        checklistItems: demand.checklist?.length ?? 0,
      },
    });

    // Moves are spread over the demand's life and finish at least two days ago. The
    // release into production is performed by the project's agilista when there is one —
    // the person who decides a delivery is ready — and by the responsible otherwise.
    const path = STATUS_PATHS[demand.status];
    const span = (ageDays - 2) * DAY;
    let from: SeedDemand['status'] = 'NOT_STARTED';
    path.forEach((to, step) => {
      const agilista = membersOf(project).find((member) => roleOf(member).slug === 'agilista');
      const mover = to === 'PRODUCTION' && agilista ? agilista : responsible;
      activity({
        key: `demand:${demand.key}:move:${step}`,
        action: 'demand.status_changed',
        occurredAt: at(createdOffset - ((step + 1) / (path.length + 1)) * span),
        actor: mover,
        subject,
        project,
        changes: [{ field: 'status', from, to }],
      });
      from = to;
    });

    (demand.checklist ?? []).forEach(([title, done], itemIndex) => {
      if (!done) {
        return;
      }
      activity({
        key: `demand:${demand.key}:check:${itemIndex}`,
        action: 'demand.checklist_item_checked',
        occurredAt: at(createdOffset - (0.2 + 0.1 * itemIndex) * span),
        actor: responsible,
        subject,
        project,
        metadata: { item: { uuid: null, title } },
      });
    });
  });

  // --- Comments -----------------------------------------------------------------------
  for (const data of SEED_COMMENTS) {
    const demand = SEED_DEMANDS.find((candidate) => candidate.key === data.demand)!;
    const demandUuid = demandUuidOf(data.demand);
    const createdAt = at(data.hoursAgo * HOUR);
    const uuid = seedUuid(`comment:${data.key}`);
    comments.push({
      uuid,
      key: data.key,
      demandUuid,
      demandKey: data.demand,
      authorUuid: SEED_UUIDS.users[data.author],
      authorKey: data.author,
      body: data.body,
      createdAt,
    });
    const flat = data.body.replace(/\s+/g, ' ');
    activity({
      key: `comment:${data.key}:added`,
      action: 'demand.comment_added',
      occurredAt: createdAt,
      actor: data.author,
      subject: { type: 'DEMAND', uuid: demandUuid, label: demand.title },
      project: demand.project as ProjectKey,
      metadata: { comment: { uuid, excerpt: flat.length > 140 ? `${flat.slice(0, 139)}…` : flat } },
    });
  }

  // --- Two refused operations, each refused for the reason the rules say it must be ---
  const routing = SEED_DEMANDS.find((demand) => demand.key === 'logistica-roteirizacao')!;
  system({
    key: 'system:admin-move-denied',
    code: 'security.permission_denied',
    occurredAt: at(2 * DAY),
    actor: 'robertoDias',
    subject: { type: 'DEMAND', uuid: demandUuidOf(routing.key), label: routing.title },
    message: 'Ação não permitida para o seu perfil (DEMAND_UPDATE).',
    metadata: {
      http: { method: 'PATCH', path: `/api/v1/demands/${demandUuidOf(routing.key)}/status`, status: 403 },
      error: { code: 'PERMISSION_DENIED' },
      attempted: { permission: 'DEMAND_UPDATE', targetStatus: 'IN_REVIEW' },
    },
  });

  const released = SEED_DEMANDS.find((demand) => demand.key === 'portal-notificacoes')!;
  system({
    key: 'system:production-move-rejected',
    code: 'domain.rule_rejected',
    occurredAt: at(1 * DAY),
    actor: 'lucasBarbosa',
    subject: { type: 'DEMAND', uuid: demandUuidOf(released.key), label: released.title },
    message: 'Demandas em produção não podem mudar de status.',
    metadata: {
      http: { method: 'PATCH', path: `/api/v1/demands/${demandUuidOf(released.key)}/status`, status: 403 },
      error: { code: 'DEMAND_IN_PRODUCTION_IS_TERMINAL' },
      attempted: { from: 'PRODUCTION', targetStatus: 'IN_PROGRESS' },
    },
  });

  logs.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return { now, logs, comments, demandCreatedAt };
}

/**
 * Proves the invented history could have happened.
 *
 * The seed already refuses to write a demand whose responsible is not on its project; this
 * holds its history to the same standard. A violation is not a warning — it means the
 * data would show evaluators something the application itself forbids.
 */
export function validateSeedActivity(activity: SeedActivity): void {
  const problems: string[] = [];
  const uuids = new Set<string>();

  const createdAtOf = (demandUuid: string) => activity.demandCreatedAt.get(demandUuid);
  const projectCreatedAt = new Map<string, Date>();
  const memberAddedAt = new Map<string, Date>();
  for (const entry of activity.logs) {
    if (entry.action === 'project.created' && entry.project) {
      projectCreatedAt.set(entry.project.uuid, entry.occurredAt);
    }
    if (entry.action === 'project.member_added' && entry.project) {
      const member = (entry.metadata?.member as { uuid: string }).uuid;
      memberAddedAt.set(`${entry.project.uuid}:${member}`, entry.occurredAt);
    }
  }

  for (const entry of activity.logs) {
    const where = `[${entry.key}]`;

    if (uuids.has(entry.uuid)) {
      problems.push(`${where} uuid duplicado`);
    }
    uuids.add(entry.uuid);

    if (entry.occurredAt.getTime() >= activity.now.getTime()) {
      problems.push(`${where} datado no futuro`);
    }

    const definition = logActionDefinition(entry.action);
    if (!definition) {
      problems.push(`${where} ação fora do catálogo: ${entry.action}`);
      continue;
    }
    if (definition.category !== entry.category) {
      problems.push(`${where} categoria ${entry.category} diverge do catálogo`);
    }
    if (definition.category === 'ACTIVITY' && scopeOf(definition) === 'PROJECT' && !entry.project) {
      problems.push(`${where} ação de projeto sem projeto`);
    }

    // Permission: the actor's seeded role must hold what the catalog says the event needs.
    if (definition.requiredPermission && entry.actorKey && !holds(entry.actorKey, definition.requiredPermission)) {
      problems.push(`${where} ${entry.actorKey} não tem ${definition.requiredPermission}`);
    }
    if (definition.requiredPermission && !entry.actorKey && entry.action !== 'role.created' && entry.action !== 'user.created') {
      problems.push(`${where} evento sem autor que exige permissão`);
    }

    // Allocation: project work is done by people on the project, unless their role sees
    // every project anyway.
    if (entry.projectKey && entry.actorKey && !holds(entry.actorKey, 'PROJECT_ACCESS_ALL')) {
      if (!membersOf(entry.projectKey).includes(entry.actorKey)) {
        problems.push(`${where} ${entry.actorKey} não participa de ${entry.projectKey}`);
      }
    }

    if (entry.subject?.type === 'DEMAND' && entry.category === 'ACTIVITY') {
      const createdAt = createdAtOf(entry.subject.uuid);
      if (!createdAt) {
        problems.push(`${where} demanda sem data de criação`);
      } else if (entry.action !== 'demand.created' && entry.occurredAt <= createdAt) {
        problems.push(`${where} registrado antes da criação da demanda`);
      }
      if (entry.action === 'demand.created' && entry.project) {
        const projectAt = projectCreatedAt.get(entry.project.uuid);
        if (!projectAt || entry.occurredAt <= projectAt) {
          problems.push(`${where} demanda criada antes do projeto`);
        }
      }
    }

    if (entry.action === 'demand.status_changed') {
      const change = entry.changes?.[0];
      if (!change?.from || !change.to || !demandState(change.from as SeedDemand['status']).canTransitionTo(demandState(change.to as SeedDemand['status']))) {
        problems.push(`${where} transição inválida ${change?.from} → ${change?.to}`);
      }
      if (entry.actorKey && entry.project && !holds(entry.actorKey, 'PROJECT_ACCESS_ALL')) {
        const allocatedAt = memberAddedAt.get(`${entry.project.uuid}:${SEED_UUIDS.users[entry.actorKey]}`);
        if (!allocatedAt || entry.occurredAt <= allocatedAt) {
          problems.push(`${where} movido antes de ${entry.actorKey} ser alocado`);
        }
      }
    }

    // Refusals must be refusals the rules would actually produce.
    if (entry.action === 'security.permission_denied') {
      const attempted = (entry.metadata?.attempted as { permission?: string } | undefined)?.permission;
      if (!attempted || !entry.actorKey || holds(entry.actorKey, attempted)) {
        problems.push(`${where} negação por permissão que o ator possui`);
      }
    }
    if (entry.action === 'domain.rule_rejected') {
      const attempted = entry.metadata?.attempted as { from?: string; targetStatus?: string } | undefined;
      const demand = SEED_DEMANDS.find((candidate) => demandUuidOf(candidate.key) === entry.subject?.uuid);
      if (
        !attempted?.from ||
        !attempted.targetStatus ||
        demand?.status !== attempted.from ||
        demandState(attempted.from as SeedDemand['status']).canTransitionTo(
          demandState(attempted.targetStatus as SeedDemand['status']),
        )
      ) {
        problems.push(`${where} regra recusada que o domínio permitiria`);
      }
      if (entry.actorKey && !holds(entry.actorKey, 'DEMAND_UPDATE')) {
        problems.push(`${where} a recusa deveria ser por permissão, não por regra`);
      }
    }
  }

  // Each demand's recorded path must end at the status the demand is seeded with.
  for (const demand of SEED_DEMANDS) {
    const uuid = demandUuidOf(demand.key);
    const moves = activity.logs.filter(
      (entry) => entry.action === 'demand.status_changed' && entry.subject?.uuid === uuid,
    );
    const finalStatus = moves.length > 0 ? moves[moves.length - 1]!.changes?.[0]?.to : 'NOT_STARTED';
    if (finalStatus !== demand.status) {
      problems.push(`[demand:${demand.key}] histórico termina em ${finalStatus}, seed diz ${demand.status}`);
    }
    if (!holds(demand.responsible as UserKey, 'DEMAND_BE_ASSIGNEE')) {
      problems.push(`[demand:${demand.key}] responsável sem DEMAND_BE_ASSIGNEE`);
    }
  }

  for (const comment of activity.comments) {
    const where = `[comment:${comment.key}]`;
    const demand = SEED_DEMANDS.find((candidate) => candidate.key === comment.demandKey);
    if (!demand) {
      problems.push(`${where} demanda inexistente`);
      continue;
    }
    if (!holds(comment.authorKey, 'DEMAND_COMMENT')) {
      problems.push(`${where} ${comment.authorKey} não tem DEMAND_COMMENT`);
    }
    if (!holds(comment.authorKey, 'PROJECT_ACCESS_ALL') && !membersOf(demand.project as ProjectKey).includes(comment.authorKey)) {
      problems.push(`${where} ${comment.authorKey} não participa do projeto da demanda`);
    }
    const createdAt = createdAtOf(comment.demandUuid);
    if (!createdAt || comment.createdAt <= createdAt || comment.createdAt >= activity.now) {
      problems.push(`${where} data fora da vida da demanda`);
    }
    if (uuids.has(comment.uuid)) {
      problems.push(`${where} uuid colide com um log`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Histórico da seed inconsistente:\n  - ${problems.join('\n  - ')}`);
  }
}
