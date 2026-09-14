import { type Prisma, PrismaClient } from '@prisma/client';
import {
  ASSISTANT_PROVIDER,
  DEFAULT_ASSISTANT_MODEL,
  modelLabel,
  previewOf,
} from '../src/modules/assistant/domain/assistant-settings';
import {
  ASSISTANT_KEY_PURPOSE,
  AesGcmSecretCipher,
} from '../src/shared/infrastructure/aes-gcm-secret-cipher';
import {
  ALL_PERMISSIONS,
  SEED_ASSISTANT,
  SEED_DEMANDS,
  SEED_PROJECTS,
  SEED_USERS,
  SEED_UUIDS,
  SYSTEM_ROLES,
  demandUuidOf,
  seedAssistantApiKey,
} from './seed-data';
import { SEED_UUID_PREFIX, buildSeedActivity, validateSeedActivity } from './seed-activity';
import { resolveDatabaseUrl } from '../src/shared/infrastructure/database-url';

// Same connection rules as the running API — including verified TLS for managed MySQL.
const prisma = new PrismaClient(
  process.env.DATABASE_URL
    ? { datasourceUrl: resolveDatabaseUrl(process.env.DATABASE_URL, process.env.DATABASE_CA_CERT) }
    : undefined,
);

/**
 * Idempotent, deterministic seed.
 *
 * Every write is an upsert keyed by a stable natural key (permission code, role slug,
 * project/user/demand uuid), so running it twice converges instead of duplicating, and
 * running it against an existing database repairs drift rather than failing.
 *
 * It is also the authority on the system roles' permission matrix: re-running restores
 * the profiles to the behaviour the specification requires, however much an evaluator
 * has experimented with them in the UI.
 */
async function main(): Promise<void> {
  log('Sincronizando catálogo de permissões...');
  for (const permission of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        code: permission.code,
        module: permission.module,
        action: permission.action,
        description: permission.description,
      },
      update: {
        module: permission.module,
        action: permission.action,
        description: permission.description,
      },
    });
  }
  log(`  ${ALL_PERMISSIONS.length} permissões`);

  log('Sincronizando perfis de sistema...');
  const roleIdBySlug = new Map<string, bigint>();
  for (const role of SYSTEM_ROLES) {
    const persisted = await prisma.role.upsert({
      where: { slug: role.slug },
      create: {
        uuid: role.uuid,
        name: role.name,
        slug: role.slug,
        isSystem: true,
        active: true,
      },
      update: { name: role.name, isSystem: true, active: true },
    });
    roleIdBySlug.set(role.slug, persisted.id);

    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...role.permissions] } },
      select: { id: true },
    });

    // Replace the grant set so the seed is corrective, not merely additive.
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: persisted.id } }),
      prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: persisted.id,
          permissionId: permission.id,
        })),
      }),
    ]);

    log(`  ${role.name}: ${role.permissions.length} permissões`);
  }

  log('Sincronizando usuários...');
  const userIdByKey = new Map<string, bigint>();
  let excludedUsers = 0;
  for (const user of SEED_USERS) {
    const roleId = roleIdBySlug.get(user.role);
    if (!roleId) {
      throw new Error(`Perfil não encontrado para o usuário ${user.name}: ${user.role}`);
    }
    // Whether this account was already soft-deleted (DeleteUser) before this run. Checked
    // ahead of the upsert because the answer decides whether `active` is corrective data
    // below, or an administrative decision this seed must leave alone.
    const existing = await prisma.user.findUnique({
      where: { uuid: user.uuid },
      select: { deletedAt: true },
    });
    /*
     * Every other field here is corrective — the seed's own job — but `active` is not,
     * for an excluded account: DeleteUser sets it to `false` on purpose, and forcing it
     * back to `true` on every restart would silently undo an exclusion the moment the
     * container comes back up, leaving `active: true` next to a `deletedAt` that still
     * says otherwise. An account nobody has excluded keeps converging on "active", the
     * same corrective behaviour this seed has always had.
     */
    if (existing?.deletedAt) {
      excludedUsers += 1;
    }
    const persisted = await prisma.user.upsert({
      where: { uuid: user.uuid },
      create: { uuid: user.uuid, name: user.name, avatarUrl: user.avatarUrl, roleId, active: true },
      update: {
        name: user.name,
        avatarUrl: user.avatarUrl,
        roleId,
        ...(existing?.deletedAt ? {} : { active: true }),
      },
    });
    userIdByKey.set(keyOf(SEED_UUIDS.users, user.uuid), persisted.id);
  }
  log(
    excludedUsers > 0
      ? `  ${SEED_USERS.length} usuários (${excludedUsers} excluído(s), situação preservada)`
      : `  ${SEED_USERS.length} usuários`,
  );

  // Projects are created by the first administrator, mirroring the real flow.
  const creatorId = userIdByKey.get('marianaAlves');
  if (!creatorId) {
    throw new Error('Usuário administrador da seed não encontrado.');
  }

  log('Sincronizando projetos e alocações...');
  const projectIdByKey = new Map<string, bigint>();
  for (const project of SEED_PROJECTS) {
    const persisted = await prisma.project.upsert({
      where: { uuid: project.uuid },
      create: {
        uuid: project.uuid,
        name: project.name,
        description: project.description,
        active: true,
        createdByUserId: creatorId,
      },
      update: { name: project.name, description: project.description, active: true },
    });
    projectIdByKey.set(keyOf(SEED_UUIDS.projects, project.uuid), persisted.id);

    const memberIds = project.members.map((member) => {
      const id = userIdByKey.get(member);
      if (!id) {
        throw new Error(`Membro não encontrado: ${member}`);
      }
      return id;
    });

    await prisma.$transaction([
      prisma.projectMember.deleteMany({ where: { projectId: persisted.id } }),
      prisma.projectMember.createMany({
        data: memberIds.map((userId) => ({ projectId: persisted.id, userId })),
      }),
    ]);

    log(`  ${project.name}: ${memberIds.length} membros`);
  }

  log('Sincronizando demandas...');
  let checklistCount = 0;
  const today = startOfTodayUTC();
  for (const demand of SEED_DEMANDS) {
    const projectId = projectIdByKey.get(demand.project);
    const responsibleId = userIdByKey.get(demand.responsible);
    if (!projectId || !responsibleId) {
      throw new Error(`Referência inválida na demanda "${demand.title}".`);
    }

    // Guards the invariant the application enforces at runtime: the responsible must
    // belong to the demand's project. A seed that violated it would produce data the
    // API itself would reject.
    const isMember = await prisma.projectMember.findFirst({
      where: { projectId, userId: responsibleId },
      select: { userId: true },
    });
    if (!isMember) {
      throw new Error(
        `Seed inconsistente: o responsável "${demand.responsible}" não participa do projeto "${demand.project}".`,
      );
    }

    const uuid = demandUuid(demand.key);
    const description = paragraph(demand.description);
    await prisma.demand.upsert({
      where: { uuid },
      create: {
        uuid,
        projectId,
        title: demand.title,
        description,
        dueDate: addDays(today, demand.dueInDays),
        status: demand.status,
        priority: demand.priority,
        responsibleUserId: responsibleId,
        createdByUserId: creatorId,
      },
      update: {
        projectId,
        title: demand.title,
        description,
        dueDate: addDays(today, demand.dueInDays),
        status: demand.status,
        priority: demand.priority,
        responsibleUserId: responsibleId,
      },
    });

    /*
     * Checklist items are reconciled by their own deterministic uuid and the extras are
     * removed, so a re-seed converges on the declared list instead of appending to it.
     */
    const demandRow = await prisma.demand.findUniqueOrThrow({
      where: { uuid },
      select: { id: true },
    });
    const items = demand.checklist ?? [];
    const itemUuids = items.map((_, index) => checklistUuid(demand.key, index));

    await prisma.demandChecklistItem.deleteMany({
      where: {
        demandId: demandRow.id,
        uuid: { notIn: itemUuids.length > 0 ? itemUuids : [''] },
      },
    });

    for (const [index, [title, done]] of items.entries()) {
      const itemUuid = itemUuids[index]!;
      await prisma.demandChecklistItem.upsert({
        where: { uuid: itemUuid },
        create: { uuid: itemUuid, demandId: demandRow.id, title, done, position: index + 1 },
        update: { title, done, position: index + 1 },
      });
    }
  }

  /*
   * Verify against the database rather than against the loop counter.
   *
   * An earlier version tallied iterations, which happily reported ten items while a uuid
   * collision left a single row behind. The seed already refuses to produce data that
   * violates an invariant; this holds it to the same standard about its own output.
   */
  const declaredItems = SEED_DEMANDS.reduce(
    (total, demand) => total + (demand.checklist?.length ?? 0),
    0,
  );
  // Scoped to the seeded demands. A global count would turn any demand a user creates
  // with a checklist into a seed failure, which is the seed policing data that is not
  // its own.
  checklistCount = await prisma.demandChecklistItem.count({
    where: { demand: { uuid: { in: SEED_DEMANDS.map((demand) => demandUuid(demand.key)) } } },
  });
  if (checklistCount !== declaredItems) {
    throw new Error(
      `Checklist inconsistente: ${declaredItems} itens declarados, ${checklistCount} gravados.`,
    );
  }
  log(`  ${SEED_DEMANDS.length} demandas, ${checklistCount} itens de checklist`);

  /*
   * History and conversation, derived from everything above rather than written by hand.
   *
   * The generator builds each demand's path to its seeded status, the organization's
   * bootstrap, a few comments and two refused operations, then proves the result before a
   * single row is written: every actor held the permission the event requires and was
   * allocated where it happened, every status transition is one the state machine allows,
   * and nothing is dated before what it depends on.
   */
  log('Sincronizando histórico de atividade e comentários...');
  const activity = buildSeedActivity(new Date());
  validateSeedActivity(activity);

  for (const [uuid, createdAt] of activity.demandCreatedAt) {
    await prisma.demand.update({ where: { uuid }, data: { createdAt } });
  }

  for (const comment of activity.comments) {
    const [demandRow, authorRow] = await Promise.all([
      prisma.demand.findUniqueOrThrow({ where: { uuid: comment.demandUuid }, select: { id: true } }),
      prisma.user.findUniqueOrThrow({ where: { uuid: comment.authorUuid }, select: { id: true } }),
    ]);
    const data = {
      demandId: demandRow.id,
      authorUserId: authorRow.id,
      body: comment.body,
      createdAt: comment.createdAt,
      editedAt: null,
    };
    await prisma.demandComment.upsert({
      where: { uuid: comment.uuid },
      create: { uuid: comment.uuid, ...data },
      update: data,
    });
  }

  for (const entry of activity.logs) {
    const data = {
      occurredAt: entry.occurredAt,
      category: entry.category,
      level: entry.level,
      action: entry.action,
      summary: entry.summary,
      actorUuid: entry.actor?.uuid ?? null,
      actorName: entry.actor?.name ?? null,
      subjectType: entry.subject?.type ?? null,
      subjectUuid: entry.subject?.uuid ?? null,
      subjectLabel: entry.subject?.label ?? null,
      projectUuid: entry.project?.uuid ?? null,
      projectName: entry.project?.name ?? null,
      changes: (entry.changes ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
      metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      requestId: null,
    };
    await prisma.log.upsert({
      where: { uuid: entry.uuid },
      create: { uuid: entry.uuid, ...data },
      update: data,
    });
  }

  // Seeded rows share a uuid prefix no UUID v7 generated today can carry, which is what
  // lets the seed prune its own stale rows without touching real activity.
  const seededLogUuids = activity.logs.map((entry) => entry.uuid);
  const seededCommentUuids = activity.comments.map((comment) => comment.uuid);
  await prisma.log.deleteMany({
    where: { uuid: { startsWith: SEED_UUID_PREFIX, notIn: seededLogUuids } },
  });
  await prisma.demandComment.deleteMany({
    where: { uuid: { startsWith: SEED_UUID_PREFIX, notIn: seededCommentUuids } },
  });

  const [logRows, commentRows] = await Promise.all([
    prisma.log.count({ where: { uuid: { startsWith: SEED_UUID_PREFIX } } }),
    prisma.demandComment.count({ where: { uuid: { startsWith: SEED_UUID_PREFIX } } }),
  ]);
  if (logRows !== activity.logs.length || commentRows !== activity.comments.length) {
    throw new Error(
      `Histórico inconsistente: ${activity.logs.length} logs e ${activity.comments.length} comentários gerados, ${logRows} e ${commentRows} gravados.`,
    );
  }
  log(`  ${logRows} registros de log, ${commentRows} comentários`);

  log('Sincronizando assistente de IA...');
  await syncAssistant();

  log('\nSeed concluída.');
  log('Usuários para avaliação:');
  for (const user of SEED_USERS) {
    log(`  ${user.name.padEnd(20)} ${user.role}`);
  }
}

/**
 * The AI assistant ships enabled with an evaluation key — written once, never re-applied.
 *
 * Every other block of this seed is corrective, because the specification owns that data.
 * This one belongs to whoever administers the installation: a key or a model changed on
 * screen must survive the seed that runs on every container start. The single repair it
 * makes is for a key that can no longer be decrypted (JWT_SECRET changed) and is still the
 * seed's own; anything an administrator saved is left exactly as it is.
 */
async function syncAssistant(): Promise<void> {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    log('  JWT_SECRET ausente: a chave do assistente não foi gravada.');
    return;
  }
  const cipher = new AesGcmSecretCipher(secret, ASSISTANT_KEY_PURPOSE);
  const seedKey = seedAssistantApiKey();
  const seedPreview = seedKey ? previewOf(seedKey) : null;
  const existing = await prisma.assistantSettings.findUnique({ where: { scope: 'GLOBAL' } });

  if (!existing) {
    await prisma.assistantSettings.create({
      data: {
        uuid: SEED_ASSISTANT.uuid,
        scope: 'GLOBAL',
        enabled: SEED_ASSISTANT.enabled,
        provider: ASSISTANT_PROVIDER,
        model: DEFAULT_ASSISTANT_MODEL,
        apiKeyCiphertext: seedKey ? cipher.encrypt(seedKey) : null,
        apiKeyPreview: seedPreview,
      },
    });
    log(
      seedKey
        ? `  ativo, ${modelLabel(DEFAULT_ASSISTANT_MODEL)}, chave de SEED_ASSISTANT_API_KEY …${seedPreview}`
        : `  ativo, ${modelLabel(DEFAULT_ASSISTANT_MODEL)}, sem chave (defina SEED_ASSISTANT_API_KEY ou cadastre na tela)`,
    );
    return;
  }

  // Self-heal for a key the seed itself wrote that can no longer be decrypted (JWT_SECRET
  // changed). Identified by its preview, so a key an administrator saved is never touched.
  const unreadable =
    existing.apiKeyCiphertext !== null && cipher.decrypt(existing.apiKeyCiphertext) === null;
  if (seedKey && unreadable && existing.apiKeyPreview === seedPreview) {
    await prisma.assistantSettings.update({
      where: { scope: 'GLOBAL' },
      data: { apiKeyCiphertext: cipher.encrypt(seedKey) },
    });
    log('  chave de avaliação cifrada de novo com o JWT_SECRET atual');
    return;
  }
  log(
    `  configuração existente preservada (${existing.enabled ? 'ativo' : 'desativado'}, ${modelLabel(existing.model)})`,
  );
}

/**
 * Descriptions are stored as markup. Escaping first is not optional: a seed string
 * containing `<` would otherwise land in the column as markup nobody wrote.
 */
function paragraph(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p>${escaped}</p>`;
}

/**
 * Stable uuid per checklist item, from its demand's position and its own.
 *
 * Deliberately not built on top of `demandUuid`: that function resolves a key by looking
 * it up in SEED_DEMANDS, so a synthetic key falls through to index -1 and every item in
 * the seed would collide on a single uuid — which is exactly what happened before this
 * was written out separately.
 */
function checklistUuid(demandKey: string, index: number): string {
  const demandIndex = SEED_DEMANDS.findIndex((demand) => demand.key === demandKey) + 1;
  if (demandIndex === 0) {
    throw new Error(`Demanda desconhecida no checklist: "${demandKey}".`);
  }
  const demandPart = demandIndex.toString(16).padStart(4, '0');
  const itemPart = (index + 1).toString(16).padStart(12, '0');
  return `4d5e6f70-${demandPart}-4a51-9d3e-${itemPart}`;
}

function demandUuid(key: string): string {
  return demandUuidOf(key);
}

function keyOf(map: Record<string, string>, uuid: string): string {
  const entry = Object.entries(map).find(([, value]) => value === uuid);
  return entry ? entry[0] : uuid;
}

/**
 * Today on the business calendar (APP_TIMEZONE), as midnight UTC — how CalendarDate
 * persists a due date. Taking the UTC date instead would shift every relative due date
 * by one day whenever the seed runs in the evening in São Paulo, when UTC is already
 * tomorrow: "vence hoje" would seed as tomorrow and the overdue demands one day less late.
 */
function startOfTodayUTC(): Date {
  const timeZone = process.env.APP_TIMEZONE || 'America/Sao_Paulo';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return new Date(`${today}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(message);
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Falha na seed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
