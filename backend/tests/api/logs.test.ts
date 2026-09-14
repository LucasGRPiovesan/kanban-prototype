import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_UUIDS } from '../../prisma/seed-data';
import { loadEnv } from '../../src/config/env';
import { createApp } from '../../src/main/app';
import { buildDependencies } from '../../src/main/composition-root';
import { revokeTemporarily } from './support/role-permissions';

/**
 * Logs, demand history and comments, end to end.
 *
 * Same premise as the main API suite: a real app over a real, seeded MySQL. The
 * properties that matter here — an entry written in the same transaction as the change,
 * a refusal that leaves a system trace but no activity, visibility that follows project
 * allocation — only exist in the database, so that is where they are checked.
 */

const API = '/api/v1';

let app: Express;
let prisma: PrismaClient;
// The seeded Agilista reads every project (PROJECT_ACCESS_ALL); this suite needs her bounded
// by allocation to exercise project isolation, so it narrows the role for its own duration.
let restoreAgilista: () => Promise<void> = async () => undefined;
const cookie = { admin: '', agilista: '', dev: '' };

interface DemandRow {
  uuid: string;
  title: string;
  status: string;
  project: { uuid: string; name: string };
}

interface LogRow {
  uuid: string;
  occurredAt: string;
  category: string;
  action: string;
  subject: { type: string; uuid: string; label: string | null } | null;
  project: { uuid: string; name: string } | null;
  requestId: string | null;
}

async function login(userUuid: string): Promise<string> {
  const response = await request(app).post(`${API}/auth/login`).send({ userUuid });
  expect(response.status).toBe(200);
  const cookies = response.headers['set-cookie'] as unknown as string[];
  return cookies.map((value) => value.split(';')[0]).join('; ');
}

async function demandsOf(session: string): Promise<DemandRow[]> {
  const response = await request(app).get(`${API}/demands`).set('Cookie', session);
  expect(response.status).toBe(200);
  return response.body.data;
}

async function logs(session: string, query: Record<string, string | number> = {}) {
  return request(app).get(`${API}/logs`).query(query).set('Cookie', session);
}

/** System events are written off the request path; give them a moment to land. */
async function eventually<T>(probe: () => Promise<T | null | undefined>): Promise<T> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const value = await probe();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('A condição não foi satisfeita a tempo.');
}

function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => keysOf(item, found));
  } else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      found.add(key);
      keysOf(inner, found);
    }
  }
  return found;
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  const env = loadEnv();
  prisma = new PrismaClient();
  app = createApp(env, buildDependencies(env, prisma));
  restoreAgilista = await revokeTemporarily(prisma, 'agilista', 'PROJECT_ACCESS_ALL');

  cookie.admin = await login(SEED_UUIDS.users.marianaAlves);
  // Joana: Agilista on Portal do Cliente and Plataforma de Dados. LOG_ACCESS; PROJECT_ACCESS_ALL
  // revoked above for this suite, so she is bounded by those two allocations.
  cookie.agilista = await login(SEED_UUIDS.users.joanaMartins);
  // Lucas: Desenvolvedor on Portal do Cliente and App de Logística. No LOG_ACCESS.
  cookie.dev = await login(SEED_UUIDS.users.lucasBarbosa);
});

afterAll(async () => {
  await restoreAgilista();
  await prisma.$disconnect();
});

describe('Activity recording', () => {
  it('records an edit with its before/after values and the request that made it', async () => {
    const demand = (await demandsOf(cookie.dev)).find(
      (row) => row.project.uuid === SEED_UUIDS.projects.portalCliente && row.status !== 'PRODUCTION',
    )!;
    const originalTitle = demand.title;

    const renamed = await request(app)
      .patch(`${API}/demands/${demand.uuid}`)
      .set('Cookie', cookie.dev)
      .send({ title: `${originalTitle} (revisão)` });
    expect(renamed.status).toBe(200);

    const restored = await request(app)
      .patch(`${API}/demands/${demand.uuid}`)
      .set('Cookie', cookie.dev)
      .send({ title: originalTitle });
    expect(restored.status).toBe(200);

    // The developer holds no LOG_ACCESS, yet reads the demand's own history.
    const history = await request(app)
      .get(`${API}/demands/${demand.uuid}/history`)
      .set('Cookie', cookie.dev);
    expect(history.status).toBe(200);

    const [latest, previous] = history.body.data.items;
    expect(latest).toMatchObject({
      category: 'ACTIVITY',
      action: 'demand.updated',
      actor: { uuid: SEED_UUIDS.users.lucasBarbosa, name: 'Lucas Barbosa' },
      subject: { type: 'DEMAND', uuid: demand.uuid },
      project: { uuid: SEED_UUIDS.projects.portalCliente },
      changes: [{ field: 'title', from: `${originalTitle} (revisão)`, to: originalTitle }],
      requestId: restored.headers['x-request-id'],
    });
    expect(previous.requestId).toBe(renamed.headers['x-request-id']);
    expect(keysOf(history.body.data).has('id')).toBe(false);
  });

  it('records nothing for a no-op move', async () => {
    const demand = (await demandsOf(cookie.dev)).find((row) => row.status === 'IN_PROGRESS')!;
    const moved = await request(app)
      .patch(`${API}/demands/${demand.uuid}/status`)
      .set('Cookie', cookie.dev)
      .send({ status: 'IN_PROGRESS' });
    expect(moved.status).toBe(200);
    expect(await prisma.log.count({ where: { requestId: moved.headers['x-request-id'] } })).toBe(0);
  });

  it('leaves a system trace, and no activity, when a rule refuses the operation', async () => {
    const production = (await demandsOf(cookie.dev)).find((row) => row.status === 'PRODUCTION')!;
    const refused = await request(app)
      .patch(`${API}/demands/${production.uuid}/status`)
      .set('Cookie', cookie.dev)
      .send({ status: 'IN_PROGRESS' });
    expect(refused.status).toBe(403);
    const requestId = refused.headers['x-request-id'] as string;

    const entry = await eventually(async () => {
      const response = await logs(cookie.admin, { category: 'SYSTEM', requestId });
      return (response.body.data.items as LogRow[])[0];
    });
    expect(entry).toMatchObject({
      action: 'domain.rule_rejected',
      subject: { type: 'DEMAND', uuid: production.uuid },
    });

    const activity = await logs(cookie.admin, { category: 'ACTIVITY', requestId });
    expect(activity.body.data.items).toEqual([]);
  });

  it('writes nothing for unauthenticated traffic', async () => {
    const requestId = `unauthenticated-${Date.now()}`;
    const response = await request(app).get(`${API}/demands`).set('x-request-id', requestId);
    expect(response.status).toBe(401);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await prisma.log.count({ where: { requestId } })).toBe(0);
  });
});

describe('Logs module visibility', () => {
  it('is closed to a profile without LOG_ACCESS', async () => {
    expect((await logs(cookie.dev)).status).toBe(403);
    const filters = await request(app).get(`${API}/logs/filters`).set('Cookie', cookie.dev);
    expect(filters.status).toBe(403);
  });

  it("limits an agilista to her projects' activity", async () => {
    const response = await logs(cookie.agilista, { limit: 100 });
    expect(response.status).toBe(200);
    const items = response.body.data.items as LogRow[];
    expect(items.length).toBeGreaterThan(0);

    const hers: string[] = [SEED_UUIDS.projects.portalCliente, SEED_UUIDS.projects.dataPlatform];
    for (const item of items) {
      expect(item.category).toBe('ACTIVITY');
      // Organization-wide activity (users, roles, sessions) carries no project.
      expect(item.project, item.action).not.toBeNull();
      expect(hers).toContain(item.project!.uuid);
    }

    const system = await logs(cookie.agilista, { category: 'SYSTEM' });
    expect(system.status).toBe(403);

    const elsewhere = await logs(cookie.agilista, { projectUuid: SEED_UUIDS.projects.appLogistica });
    expect(elsewhere.status).toBe(404);
  });

  it('trims the filter options to what the actor can see', async () => {
    const agilista = await request(app).get(`${API}/logs/filters`).set('Cookie', cookie.agilista);
    expect(agilista.status).toBe(200);
    expect(agilista.body.data.categories).toEqual(['ACTIVITY']);
    expect(agilista.body.data.canViewOrganization).toBe(false);
    const codes = (agilista.body.data.actions as { code: string }[]).map((action) => action.code);
    expect(codes).toContain('demand.status_changed');
    expect(codes).not.toContain('role.permissions_changed');
    expect(codes).not.toContain('security.permission_denied');
    expect((agilista.body.data.projects as { name: string }[]).map((p) => p.name).sort()).toEqual([
      'Plataforma de Dados',
      'Portal do Cliente',
    ]);

    const admin = await request(app).get(`${API}/logs/filters`).set('Cookie', cookie.admin);
    expect(admin.body.data.categories).toEqual(['ACTIVITY', 'SYSTEM']);
    expect(admin.body.data.canViewOrganization).toBe(true);
  });

  it('shows an administrator organization activity and system events', async () => {
    const organization = await logs(cookie.admin, { action: 'role.created' });
    expect(organization.status).toBe(200);
    expect(organization.body.data.items.length).toBeGreaterThan(0);

    const system = await logs(cookie.admin, { category: 'SYSTEM', limit: 100 });
    expect(system.status).toBe(200);
    expect((system.body.data.items as LogRow[]).every((item) => item.category === 'SYSTEM')).toBe(true);
    expect(system.body.data.items.length).toBeGreaterThan(0);
  });

  it('pages by offset without overlap or reordering, with a known total', async () => {
    const first = await logs(cookie.admin, { limit: 7, page: 1 });
    expect(first.status).toBe(200);
    expect(first.body.data.items).toHaveLength(7);
    expect(first.body.data.page).toBe(1);
    expect(first.body.data.pageSize).toBe(7);
    expect(typeof first.body.data.total).toBe('number');
    expect(first.body.data.total).toBeGreaterThanOrEqual(7);

    const second = await logs(cookie.admin, { limit: 7, page: 2 });
    expect(second.status).toBe(200);
    expect(second.body.data.page).toBe(2);
    expect(second.body.data.total).toBe(first.body.data.total);

    const pageOne = first.body.data.items as LogRow[];
    const pageTwo = second.body.data.items as LogRow[];
    const seen = new Set(pageOne.map((item) => item.uuid));
    expect(pageTwo.some((item) => seen.has(item.uuid))).toBe(false);

    const times = [...pageOne, ...pageTwo].map((item) => Date.parse(item.occurredAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(keysOf(first.body.data).has('id')).toBe(false);
  });
});

describe('Demand comments', () => {
  it('lets the author edit and delete, and nobody else', async () => {
    const demand = (await demandsOf(cookie.dev)).find(
      (row) => row.project.uuid === SEED_UUIDS.projects.portalCliente && row.status !== 'PRODUCTION',
    )!;
    const base = `${API}/demands/${demand.uuid}/comments`;

    const added = await request(app)
      .post(base)
      .set('Cookie', cookie.dev)
      .send({ body: '  Revisado com o time de design.  ' });
    expect(added.status).toBe(201);
    const comment = added.body.data;
    expect(comment).toMatchObject({
      body: 'Revisado com o time de design.',
      author: { uuid: SEED_UUIDS.users.lucasBarbosa },
      editedAt: null,
      canEdit: true,
    });

    const asColleague = await request(app).get(base).set('Cookie', cookie.agilista);
    expect(asColleague.status).toBe(200);
    const seen = (asColleague.body.data as { uuid: string; canEdit: boolean }[]).find(
      (row) => row.uuid === comment.uuid,
    );
    expect(seen?.canEdit).toBe(false);

    const foreignEdit = await request(app)
      .patch(`${base}/${comment.uuid}`)
      .set('Cookie', cookie.agilista)
      .send({ body: 'Tentativa' });
    expect(foreignEdit.status).toBe(403);
    expect(foreignEdit.body.error.code).toBe('COMMENT_NOT_AUTHOR');

    const foreignDelete = await request(app).delete(`${base}/${comment.uuid}`).set('Cookie', cookie.agilista);
    expect(foreignDelete.status).toBe(403);

    const edited = await request(app)
      .patch(`${base}/${comment.uuid}`)
      .set('Cookie', cookie.dev)
      .send({ body: 'Revisado e aprovado com o time de design.' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.editedAt).not.toBeNull();

    // The Logs module records the conversation, and so does the demand's own "Atualizações"
    // tab — a comment is real activity on the card, not something to hide from its history.
    const recorded = await logs(cookie.admin, {
      action: 'demand.comment_edited',
      requestId: edited.headers['x-request-id'] as string,
    });
    expect(recorded.body.data.items).toHaveLength(1);
    const history = await request(app).get(`${API}/demands/${demand.uuid}/history`).set('Cookie', cookie.dev);
    const historyActions = (history.body.data.items as LogRow[]).map((item) => item.action);
    expect(historyActions).toContain('demand.comment_added');
    expect(historyActions).toContain('demand.comment_edited');

    const removed = await request(app).delete(`${base}/${comment.uuid}`).set('Cookie', cookie.dev);
    expect(removed.status).toBe(204);
    const after = await request(app).get(base).set('Cookie', cookie.dev);
    expect((after.body.data as { uuid: string }[]).some((row) => row.uuid === comment.uuid)).toBe(false);
  });

  it('accepts conversation on a demand in production', async () => {
    const production = (await demandsOf(cookie.dev)).find((row) => row.status === 'PRODUCTION')!;
    const base = `${API}/demands/${production.uuid}/comments`;
    const added = await request(app).post(base).set('Cookie', cookie.dev).send({ body: 'Validado em produção.' });
    expect(added.status).toBe(201);
    await request(app).delete(`${base}/${added.body.data.uuid}`).set('Cookie', cookie.dev);
  });

  it("reports another project's demand as not found", async () => {
    const logistics = (await demandsOf(cookie.dev)).find(
      (row) => row.project.uuid === SEED_UUIDS.projects.appLogistica,
    )!;
    const response = await request(app)
      .post(`${API}/demands/${logistics.uuid}/comments`)
      .set('Cookie', cookie.agilista)
      .send({ body: 'Não deveria chegar aqui.' });
    expect(response.status).toBe(404);

    const history = await request(app)
      .get(`${API}/demands/${logistics.uuid}/history`)
      .set('Cookie', cookie.agilista);
    expect(history.status).toBe(404);
  });

  it('validates the body', async () => {
    const demand = (await demandsOf(cookie.dev))[0]!;
    const response = await request(app)
      .post(`${API}/demands/${demand.uuid}/comments`)
      .set('Cookie', cookie.dev)
      .send({ body: '   ' });
    expect(response.status).toBe(422);
  });
});
