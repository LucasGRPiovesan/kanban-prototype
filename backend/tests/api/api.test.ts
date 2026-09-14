import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env';
import { createApp } from '../../src/main/app';
import { buildDependencies } from '../../src/main/composition-root';
import { SEED_UUIDS } from '../../prisma/seed-data';
import { revokeTemporarily } from './support/role-permissions';

/**
 * End-to-end API tests.
 *
 * These run against a real Express app and a real MySQL, because the properties under
 * test — authorization, project isolation, and the promise that no internal id ever
 * crosses the boundary — are exactly the ones a mocked database would not verify.
 * They assume `npm run db:migrate && npm run db:seed` has been run.
 */

let app: Express;
let prisma: PrismaClient;

const token = new Map<string, string>();

async function login(app: Express, userUuid: string): Promise<string> {
  const response = await request(app).post('/api/v1/auth/login').send({ userUuid });
  expect(response.status).toBe(200);
  const cookies = response.headers['set-cookie'] as unknown as string[];
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

const AS = {
  admin: () => token.get('admin')!,
  agilista: () => token.get('agilista')!,
  dev: () => token.get('dev')!,
};

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  const env = loadEnv();
  prisma = new PrismaClient();
  app = createApp(env, buildDependencies(env, prisma));

  token.set('admin', await login(app, SEED_UUIDS.users.marianaAlves));
  // Joana is an Agilista allocated to Portal do Cliente and Plataforma de Dados.
  token.set('agilista', await login(app, SEED_UUIDS.users.joanaMartins));
  // Lucas is a Desenvolvedor on Portal do Cliente and App de Logística.
  token.set('dev', await login(app, SEED_UUIDS.users.lucasBarbosa));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Health and docs', () => {
  it('exposes a health endpoint', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
  });

  it('serves the OpenAPI document', async () => {
    const response = await request(app).get('/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.0.3');
  });

  /**
   * Regression: helmet's default `X-Frame-Options: SAMEORIGIN` is invisible to an
   * `<img>` thumbnail but blocks the attachment viewer's `<iframe>` outright — Firefox
   * reports "won't allow ... to display the page if another site has embedded it", and
   * Chrome fails the same way silently. This origin serves only JSON and user-uploaded
   * files, neither of them a page a clickjacking attack could hijack, so nothing here is
   * protected by that header in the first place.
   */
  it('serves uploaded files without a header that blocks framing them', async () => {
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.dev());
    const demand = list.body.data.find((d: { status: string }) => d.status !== 'PRODUCTION');

    const uploaded = await request(app)
      .post(`/api/v1/demands/${demand.uuid}/attachments`)
      .set('Cookie', AS.dev())
      .attach('files', Buffer.from('%PDF-1.4\n%%EOF'), {
        filename: 'relatorio.pdf',
        contentType: 'application/pdf',
      });
    expect(uploaded.status).toBe(201);

    const fileUrl = new URL(uploaded.body.data[0].url);
    const served = await request(app).get(fileUrl.pathname);
    expect(served.status).toBe(200);
    expect(served.headers['x-frame-options']).toBeUndefined();

    await request(app)
      .delete(`/api/v1/demands/${demand.uuid}/attachments/${uploaded.body.data[0].uuid}`)
      .set('Cookie', AS.dev());
  });
});

describe('Authentication', () => {
  it('lists login candidates without a session', async () => {
    const response = await request(app).get('/api/v1/auth/candidates');
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    // The picker draws each candidate's avatar; the seed gives every user one.
    for (const candidate of response.body.data as { avatarUrl: string | null }[]) {
      expect(candidate.avatarUrl).toBeTruthy();
    }
  });

  it('refuses protected routes without a session', async () => {
    const response = await request(app).get('/api/v1/demands');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('refuses a forged token', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(response.status).toBe(401);
  });

  it('issues an HttpOnly, SameSite=Lax cookie on login', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ userUuid: SEED_UUIDS.users.marianaAlves });
    const cookies = (response.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('SameSite=Lax');
  });

  it('marks every API response as not cacheable', async () => {
    const response = await request(app).get('/api/v1/auth/me').set('Cookie', AS.admin());
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('refuses a state-changing request from a foreign origin, even with a valid session (CSRF)', async () => {
    const forged = await request(app)
      .post('/api/v1/notifications/read-all')
      .set('Cookie', AS.admin())
      .set('Origin', 'https://evil.example');
    expect(forged.status).toBe(403);
    expect(forged.body.error.code).toBe('ORIGIN_NOT_ALLOWED');

    const forgedLogin = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ userUuid: SEED_UUIDS.users.marianaAlves });
    expect(forgedLogin.status).toBe(403);

    const allowed = await request(app)
      .post('/api/v1/notifications/read-all')
      .set('Cookie', AS.admin())
      .set('Origin', loadEnv().corsOrigins[0]!);
    expect(allowed.status).toBe(200);
  });

  it('refuses to change your own profile (privilege escalation), but keeps renaming yourself', async () => {
    const roles = await request(app).get('/api/v1/roles/assignable').set('Cookie', AS.admin());
    const agilista = (roles.body.data as { uuid: string; slug: string }[]).find((r) => r.slug === 'agilista')!;

    const escalate = await request(app)
      .patch(`/api/v1/users/${SEED_UUIDS.users.marianaAlves}`)
      .set('Cookie', AS.admin())
      .send({ roleUuid: agilista.uuid });
    expect(escalate.status).toBe(403);
    expect(escalate.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');

    const me = await prisma.user.findUniqueOrThrow({
      where: { uuid: SEED_UUIDS.users.marianaAlves },
      select: { role: { select: { uuid: true } } },
    });
    const sameRole = await request(app)
      .patch(`/api/v1/users/${SEED_UUIDS.users.marianaAlves}`)
      .set('Cookie', AS.admin())
      .send({ roleUuid: me.role.uuid });
    expect(sameRole.status).toBe(200);
  });

  it('never authenticates an excluded account, and refuses to reactivate one directly', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { uuid: SEED_UUIDS.users.andreCarvalho },
      select: { active: true, deletedAt: true },
    });
    // Simulates a row left inconsistent by hand: active, yet excluded.
    await prisma.user.update({
      where: { uuid: SEED_UUIDS.users.andreCarvalho },
      data: { active: true, deletedAt: new Date() },
    });
    try {
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ userUuid: SEED_UUIDS.users.andreCarvalho });
      expect(login.status).toBe(401);

      const candidates = await request(app).get('/api/v1/auth/candidates');
      const uuids = (candidates.body.data as { uuid: string }[]).map((c) => c.uuid);
      expect(uuids).not.toContain(SEED_UUIDS.users.andreCarvalho);

      const reactivate = await request(app)
        .patch(`/api/v1/users/${SEED_UUIDS.users.andreCarvalho}`)
        .set('Cookie', AS.admin())
        .send({ active: true });
      expect(reactivate.status).toBe(409);
      expect(reactivate.body.error.code).toBe('USER_DELETED');
    } finally {
      await prisma.user.update({
        where: { uuid: SEED_UUIDS.users.andreCarvalho },
        data: { active: user.active, deletedAt: user.deletedAt },
      });
    }
  });

  it('rejects a login for an unknown user', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ userUuid: '00000000-0000-4000-8000-000000000000' });
    expect(response.status).toBe(401);
  });

  it('returns the effective permissions of the session', async () => {
    const response = await request(app).get('/api/v1/auth/me').set('Cookie', AS.admin());
    expect(response.status).toBe(200);
    expect(response.body.data.permissions).toContain('PROJECT_ACCESS_ALL');
    // The Administrador must not be able to move, edit or delete demands.
    expect(response.body.data.permissions).not.toContain('DEMAND_UPDATE');
    expect(response.body.data.permissions).not.toContain('DEMAND_DELETE');
  });
});

describe('Identifiers never leak', () => {
  it('exposes no numeric id on any collection endpoint', async () => {
    const paths = ['/api/v1/demands', '/api/v1/projects', '/api/v1/users', '/api/v1/roles'];

    for (const path of paths) {
      const response = await request(app).get(path).set('Cookie', AS.admin());
      expect(response.status).toBe(200);
      const body = JSON.stringify(response.body);
      // No `"id": 42`-shaped field anywhere in the payload.
      expect(body).not.toMatch(/"id"\s*:\s*\d+/);
      expect(body).not.toMatch(/"(projectId|userId|roleId|responsibleUserId|createdByUserId)"/);
    }
  });

  it('addresses resources by uuid', async () => {
    const response = await request(app).get('/api/v1/demands').set('Cookie', AS.admin());
    const [demand] = response.body.data;
    expect(demand.uuid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns 404 for a numeric path segment instead of resolving it', async () => {
    const response = await request(app).get('/api/v1/demands/42').set('Cookie', AS.admin());
    expect(response.status).toBe(422);
  });
});

describe('Project isolation', () => {
  it('shows an administrator every project via PROJECT_ACCESS_ALL', async () => {
    const response = await request(app).get('/api/v1/projects').set('Cookie', AS.admin());
    expect(response.body.data.length).toBe(3);
  });

  it('shows an agilista every project and every demand, regardless of allocation', async () => {
    // Joana is allocated to two projects only; the seeded Agilista holds PROJECT_ACCESS_ALL.
    const projects = await request(app).get('/api/v1/projects').set('Cookie', AS.agilista());
    expect(projects.body.data.length).toBe(3);

    const demands = await request(app).get('/api/v1/demands').set('Cookie', AS.agilista());
    const names = new Set(demands.body.data.map((d: { project: { name: string } }) => d.project.name));
    expect(names).toEqual(new Set(['App de Logística', 'Plataforma de Dados', 'Portal do Cliente']));
  });

  it('does not let member management reach a project outside the actor isolation boundary', async () => {
    // An administrador without PROJECT_ACCESS_ALL is allocated to no project at all.
    const restore = await revokeTemporarily(prisma, 'administrador', 'PROJECT_ACCESS_ALL');
    try {
      const add = await request(app)
        .post(`/api/v1/projects/${SEED_UUIDS.projects.dataPlatform}/members`)
        .set('Cookie', AS.admin())
        .send({ userUuid: SEED_UUIDS.users.marianaAlves });
      expect(add.status).toBe(404);

      const remove = await request(app)
        .delete(`/api/v1/projects/${SEED_UUIDS.projects.dataPlatform}/members/${SEED_UUIDS.users.sofiaLimaBraga}`)
        .set('Cookie', AS.admin());
      expect(remove.status).toBe(404);
    } finally {
      await restore();
    }
    const members = await prisma.projectMember.count({
      where: { project: { uuid: SEED_UUIDS.projects.dataPlatform }, user: { uuid: SEED_UUIDS.users.marianaAlves } },
    });
    expect(members).toBe(0);
  });

  it('limits a regular user to their allocations', async () => {
    const response = await request(app).get('/api/v1/projects').set('Cookie', AS.dev());
    const names = response.body.data.map((p: { name: string }) => p.name).sort();
    expect(names).toEqual(['App de Logística', 'Portal do Cliente']);
  });

  it('limits demands to the projects the user belongs to', async () => {
    const response = await request(app).get('/api/v1/demands').set('Cookie', AS.dev());
    const projects = new Set(response.body.data.map((d: { project: { name: string } }) => d.project.name));
    expect(projects.has('Plataforma de Dados')).toBe(false);
  });

  it('reports a demand of another project as not found', async () => {
    const all = await request(app).get('/api/v1/demands').set('Cookie', AS.admin());
    const foreign = all.body.data.find(
      (d: { project: { name: string } }) => d.project.name === 'Plataforma de Dados',
    );

    const response = await request(app)
      .get(`/api/v1/demands/${foreign.uuid}`)
      .set('Cookie', AS.dev());

    // Not 403: confirming existence would itself cross the isolation boundary.
    expect(response.status).toBe(404);
  });
});

describe('Kanban ordering and search', () => {
  it('orders demands by due date ascending', async () => {
    const response = await request(app).get('/api/v1/demands').set('Cookie', AS.admin());
    const dates = response.body.data.map((d: { dueDate: string }) => d.dueDate);
    expect([...dates].sort()).toEqual(dates);
  });

  it('returns due dates as calendar dates, never timestamps', async () => {
    const response = await request(app).get('/api/v1/demands').set('Cookie', AS.admin());
    for (const demand of response.body.data) {
      expect(demand.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('filters by search term', async () => {
    const response = await request(app)
      .get('/api/v1/demands?search=login')
      .set('Cookie', AS.admin());
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data.every((d: { title: string }) => /login/i.test(d.title))).toBe(true);
  });
});

describe('Production is terminal', () => {
  it('refuses every transition out of production without DEMAND_MANAGE_PRODUCTION', async () => {
    // Desenvolvedor holds DEMAND_UPDATE but not DEMAND_MANAGE_PRODUCTION — the seeded
    // matrix's example of someone who can edit a demand but not unlock it from produção.
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.dev());
    const production = list.body.data.find((d: { status: string }) => d.status === 'PRODUCTION');
    expect(production).toBeDefined();

    for (const status of ['NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'IN_REVIEW']) {
      const response = await request(app)
        .patch(`/api/v1/demands/${production.uuid}/status`)
        .set('Cookie', AS.dev())
        .send({ status });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('DEMAND_IN_PRODUCTION_IS_TERMINAL');
    }

    // Still in production after the rejected attempts.
    const after = await request(app)
      .get(`/api/v1/demands/${production.uuid}`)
      .set('Cookie', AS.dev());
    expect(after.body.data.status).toBe('PRODUCTION');
  });

  it('lets DEMAND_MANAGE_PRODUCTION move a demand out of production and back in', async () => {
    // Joana (Agilista) holds DEMAND_MANAGE_PRODUCTION in the seeded matrix.
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.agilista());
    const production = list.body.data.find((d: { status: string }) => d.status === 'PRODUCTION');
    expect(production).toBeDefined();

    const out = await request(app)
      .patch(`/api/v1/demands/${production.uuid}/status`)
      .set('Cookie', AS.agilista())
      .send({ status: 'IN_REVIEW' });
    expect(out.status).toBe(200);
    expect(out.body.data.status).toBe('IN_REVIEW');

    const back = await request(app)
      .patch(`/api/v1/demands/${production.uuid}/status`)
      .set('Cookie', AS.agilista())
      .send({ status: 'PRODUCTION' });
    expect(back.status).toBe(200);
    expect(back.body.data.status).toBe('PRODUCTION');
  });

  it('refuses to edit a demand in production', async () => {
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.agilista());
    const production = list.body.data.find((d: { status: string }) => d.status === 'PRODUCTION');

    const response = await request(app)
      .patch(`/api/v1/demands/${production.uuid}`)
      .set('Cookie', AS.agilista())
      .send({ title: 'Tentativa de alteração' });

    expect(response.status).toBe(403);
  });
});

describe('Checklist', () => {
  async function anyEditableDemand(cookie: string) {
    const list = await request(app).get('/api/v1/demands').set('Cookie', cookie);
    return list.body.data.find((d: { status: string }) => d.status !== 'PRODUCTION');
  }

  it('adds, ticks, renames and removes an item', async () => {
    const demand = await anyEditableDemand(AS.dev());
    const before = await request(app)
      .get(`/api/v1/demands/${demand.uuid}`)
      .set('Cookie', AS.dev());
    const initialCount = before.body.data.checklist.length;

    const created = await request(app)
      .post(`/api/v1/demands/${demand.uuid}/checklist`)
      .set('Cookie', AS.dev())
      .send({ title: 'Item criado pelo teste' });
    expect(created.status).toBe(201);
    const itemUuid = created.body.data.uuid;

    const ticked = await request(app)
      .patch(`/api/v1/demands/${demand.uuid}/checklist/${itemUuid}`)
      .set('Cookie', AS.dev())
      .send({ done: true, title: 'Item renomeado pelo teste' });
    expect(ticked.status).toBe(204);

    const after = await request(app)
      .get(`/api/v1/demands/${demand.uuid}`)
      .set('Cookie', AS.dev());
    const item = after.body.data.checklist.find((i: { uuid: string }) => i.uuid === itemUuid);
    expect(item).toMatchObject({ title: 'Item renomeado pelo teste', done: true });

    const removed = await request(app)
      .delete(`/api/v1/demands/${demand.uuid}/checklist/${itemUuid}`)
      .set('Cookie', AS.dev());
    expect(removed.status).toBe(204);

    const final = await request(app)
      .get(`/api/v1/demands/${demand.uuid}`)
      .set('Cookie', AS.dev());
    expect(final.body.data.checklist).toHaveLength(initialCount);
  });

  it('never exposes an internal id on a checklist item', async () => {
    const demand = await anyEditableDemand(AS.dev());
    const response = await request(app)
      .get(`/api/v1/demands/${demand.uuid}`)
      .set('Cookie', AS.dev());
    for (const item of response.body.data.checklist) {
      expect(item).not.toHaveProperty('id');
      expect(item).not.toHaveProperty('demandId');
    }
  });

  /** DEMAND_UPDATE governs a demand's scope, and a checklist item is part of it. */
  it('refuses a caller without DEMAND_UPDATE', async () => {
    const demand = await anyEditableDemand(AS.agilista());
    const response = await request(app)
      .post(`/api/v1/demands/${demand.uuid}/checklist`)
      .set('Cookie', AS.admin())
      .send({ title: 'Não deveria entrar' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('refuses any checklist change on a demand in production', async () => {
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.dev());
    const production = list.body.data.find((d: { status: string }) => d.status === 'PRODUCTION');

    const response = await request(app)
      .post(`/api/v1/demands/${production.uuid}/checklist`)
      .set('Cookie', AS.dev())
      .send({ title: 'Item em demanda congelada' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('DEMAND_IN_PRODUCTION_IS_TERMINAL');
  });
});

describe('Checklist at creation time', () => {
  /**
   * Regression: the checklist used to be written by follow-up requests after the demand
   * existed, which meant it needed DEMAND_UPDATE. An Administrador may create demands but
   * not edit them, so the items they had just typed were silently rejected. Creating the
   * aggregate whole puts the list under DEMAND_CREATE, where it belongs.
   */
  it('lets a caller who may create but not edit include a checklist', async () => {
    const admin = await request(app).get('/api/v1/auth/me').set('Cookie', AS.admin());
    expect(admin.body.data.permissions).toContain('DEMAND_CREATE');
    expect(admin.body.data.permissions).not.toContain('DEMAND_UPDATE');

    // The project comes from the agilista's own allocation: the fixture is deleted as
    // the agilista afterwards, and a delete against a project they cannot reach reports
    // "not found" rather than failing loudly, leaving the row behind.
    const projects = await request(app).get('/api/v1/projects').set('Cookie', AS.agilista());
    const project = projects.body.data[0];
    const eligible = await request(app)
      .get(`/api/v1/projects/${project.uuid}/eligible-assignees`)
      .set('Cookie', AS.admin());

    const created = await request(app)
      .post('/api/v1/demands')
      .set('Cookie', AS.admin())
      .send({
        projectUuid: project.uuid,
        title: 'Demanda criada com checklist',
        description: '<p>Criada junto com sua lista.</p>',
        dueDate: '2026-12-20',
        responsibleUuid: eligible.body.data[0].uuid,
        checklist: ['Primeiro passo', 'Segundo passo', 'Terceiro passo'],
      });
    expect(created.status).toBe(201);

    const detail = await request(app)
      .get(`/api/v1/demands/${created.body.data.uuid}`)
      .set('Cookie', AS.admin());
    expect(detail.body.data.checklist.map((i: { title: string }) => i.title)).toEqual([
      'Primeiro passo',
      'Segundo passo',
      'Terceiro passo',
    ]);
    // Order is a contract, not an accident of insertion.
    expect(detail.body.data.checklist.map((i: { position: number }) => i.position)).toEqual([
      1, 2, 3,
    ]);

    const cleaned = await request(app)
      .delete(`/api/v1/demands/${created.body.data.uuid}`)
      .set('Cookie', AS.agilista());
    expect(cleaned.status).toBe(204);
  });

  it('creates a demand with no checklist when none is sent', async () => {
    // The project comes from the agilista's own allocation: the fixture is deleted as
    // the agilista afterwards, and a delete against a project they cannot reach reports
    // "not found" rather than failing loudly, leaving the row behind.
    const projects = await request(app).get('/api/v1/projects').set('Cookie', AS.agilista());
    const project = projects.body.data[0];
    const eligible = await request(app)
      .get(`/api/v1/projects/${project.uuid}/eligible-assignees`)
      .set('Cookie', AS.admin());

    const created = await request(app)
      .post('/api/v1/demands')
      .set('Cookie', AS.admin())
      .send({
        projectUuid: project.uuid,
        title: 'Demanda sem checklist',
        description: '<p>Sem lista.</p>',
        dueDate: '2026-12-20',
        responsibleUuid: eligible.body.data[0].uuid,
      });
    expect(created.status).toBe(201);

    const detail = await request(app)
      .get(`/api/v1/demands/${created.body.data.uuid}`)
      .set('Cookie', AS.admin());
    expect(detail.body.data.checklist).toEqual([]);

    const cleaned = await request(app)
      .delete(`/api/v1/demands/${created.body.data.uuid}`)
      .set('Cookie', AS.agilista());
    expect(cleaned.status).toBe(204);
  });
});

describe('Rich-text description', () => {
  it('stores the formatting and strips the script', async () => {
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.dev());
    const demand = list.body.data.find((d: { status: string }) => d.status !== 'PRODUCTION');
    const original = demand.description;

    const response = await request(app)
      .patch(`/api/v1/demands/${demand.uuid}`)
      .set('Cookie', AS.dev())
      .send({
        description:
          '<p>Texto <strong>importante</strong>.</p><script>alert(1)</script><p onclick="x()">Outro</p>',
      });
    expect(response.status).toBe(200);

    const after = await request(app)
      .get(`/api/v1/demands/${demand.uuid}`)
      .set('Cookie', AS.dev());
    expect(after.body.data.description).toContain('<strong>importante</strong>');
    expect(after.body.data.description).not.toContain('script');
    expect(after.body.data.description).not.toContain('onclick');

    await request(app)
      .patch(`/api/v1/demands/${demand.uuid}`)
      .set('Cookie', AS.dev())
      .send({ description: original });
  });

  it('rejects markup that carries no text', async () => {
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.dev());
    const demand = list.body.data.find((d: { status: string }) => d.status !== 'PRODUCTION');

    const response = await request(app)
      .patch(`/api/v1/demands/${demand.uuid}`)
      .set('Cookie', AS.dev())
      .send({ description: '<p><br></p>' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_DEMAND_DESCRIPTION');
  });
});

describe('Project transfer', () => {
  interface Member {
    userUuid: string;
  }

  async function membersOf(projectUuid: string): Promise<string[]> {
    const response = await request(app)
      .get(`/api/v1/projects/${projectUuid}/members`)
      .set('Cookie', AS.admin());
    return (response.body.data as Member[]).map((member) => member.userUuid);
  }

  // Transferring a project is DEMAND_UPDATE_PROJECT territory, not plain DEMAND_UPDATE
  // — the Agilista holds it, the Desenvolvedor deliberately does not (see seed-data.ts).
  /**
   * Allocation is per project, so a transfer re-opens the eligibility question even
   * when the caller says nothing about the responsible. Both outcomes are asserted,
   * because a rule that only ever refuses is indistinguishable from a broken feature.
   */
  it('moves a demand when the responsible is a member of the destination too', async () => {
    const reachable = await request(app).get('/api/v1/projects').set('Cookie', AS.agilista());
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.agilista());

    // Searched across every visible demand, not just the first by due date: which one
    // happens to have a dual-membership responsible depends on who is asking — the
    // Agilista's own two projects overlap in membership differently than a
    // Desenvolvedor's do — so the search has to be as broad as the eligibility rule
    // itself, the same way the "refuses" test just below already searches.
    let demand: { uuid: string; project: { uuid: string } } | null = null;
    let destination: string | null = null;
    outer: for (const candidate of list.body.data as {
      uuid: string;
      status: string;
      project: { uuid: string };
      responsible: { uuid: string };
    }[]) {
      if (candidate.status === 'PRODUCTION') continue;
      for (const project of reachable.body.data as { uuid: string }[]) {
        if (project.uuid === candidate.project.uuid) continue;
        if ((await membersOf(project.uuid)).includes(candidate.responsible.uuid)) {
          demand = candidate;
          destination = project.uuid;
          break outer;
        }
      }
    }
    expect(demand, 'a seed com responsável em dois projetos é pré-requisito').not.toBeNull();

    const moved = await request(app)
      .patch(`/api/v1/demands/${demand!.uuid}`)
      .set('Cookie', AS.agilista())
      .send({ projectUuid: destination });
    expect(moved.status).toBe(200);

    const after = await request(app)
      .get(`/api/v1/demands/${demand!.uuid}`)
      .set('Cookie', AS.agilista());
    expect(after.body.data.project.uuid).toBe(destination);

    // Put it back: later assertions read the seeded board.
    const restored = await request(app)
      .patch(`/api/v1/demands/${demand!.uuid}`)
      .set('Cookie', AS.agilista())
      .send({ projectUuid: demand!.project.uuid });
    expect(restored.status).toBe(200);
  });

  it('refuses a transfer that would leave an ineligible responsible', async () => {
    const reachable = await request(app).get('/api/v1/projects').set('Cookie', AS.agilista());
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.agilista());

    let subject: { uuid: string; project: { uuid: string } } | null = null;
    let destination: string | null = null;

    outer: for (const demand of list.body.data as {
      uuid: string;
      status: string;
      project: { uuid: string };
      responsible: { uuid: string };
    }[]) {
      if (demand.status === 'PRODUCTION') continue;
      for (const project of reachable.body.data as { uuid: string }[]) {
        if (project.uuid === demand.project.uuid) continue;
        if (!(await membersOf(project.uuid)).includes(demand.responsible.uuid)) {
          subject = demand;
          destination = project.uuid;
          break outer;
        }
      }
    }
    expect(subject, 'a seed precisa de um responsável fora de algum projeto').not.toBeNull();

    const response = await request(app)
      .patch(`/api/v1/demands/${subject!.uuid}`)
      .set('Cookie', AS.agilista())
      .send({ projectUuid: destination });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('RESPONSIBLE_NOT_PROJECT_MEMBER');

    // Rejected in full: the project must not have moved either.
    const after = await request(app)
      .get(`/api/v1/demands/${subject!.uuid}`)
      .set('Cookie', AS.agilista());
    expect(after.body.data.project.uuid).toBe(subject!.project.uuid);
  });

  it('accepts the transfer when a valid responsible comes with it', async () => {
    const reachable = await request(app).get('/api/v1/projects').set('Cookie', AS.agilista());
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.agilista());
    const demand = list.body.data.find((d: { status: string }) => d.status !== 'PRODUCTION');

    const destination = (reachable.body.data as { uuid: string }[]).find(
      (project) => project.uuid !== demand.project.uuid,
    );
    expect(destination).toBeDefined();

    const eligible = await request(app)
      .get(`/api/v1/projects/${destination!.uuid}/eligible-assignees`)
      .set('Cookie', AS.agilista());
    const newResponsible = eligible.body.data[0];
    expect(newResponsible).toBeDefined();

    const moved = await request(app)
      .patch(`/api/v1/demands/${demand.uuid}`)
      .set('Cookie', AS.agilista())
      .send({ projectUuid: destination!.uuid, responsibleUuid: newResponsible.uuid });
    expect(moved.status).toBe(200);

    const after = await request(app)
      .get(`/api/v1/demands/${demand.uuid}`)
      .set('Cookie', AS.agilista());
    expect(after.body.data.project.uuid).toBe(destination!.uuid);
    expect(after.body.data.responsible.uuid).toBe(newResponsible.uuid);

    await request(app)
      .patch(`/api/v1/demands/${demand.uuid}`)
      .set('Cookie', AS.agilista())
      .send({ projectUuid: demand.project.uuid, responsibleUuid: demand.responsible.uuid });
  });
});

describe('Role-based authorization', () => {
  it('lets an agilista move a card and restores it afterwards', async () => {
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.agilista());
    const target = list.body.data.find((d: { status: string }) => d.status === 'NOT_STARTED');

    const moved = await request(app)
      .patch(`/api/v1/demands/${target.uuid}/status`)
      .set('Cookie', AS.agilista())
      .send({ status: 'IN_PROGRESS' });
    expect(moved.status).toBe(200);
    expect(moved.body.data.status).toBe('IN_PROGRESS');

    await request(app)
      .patch(`/api/v1/demands/${target.uuid}/status`)
      .set('Cookie', AS.agilista())
      .send({ status: 'NOT_STARTED' });
  });

  it('refuses an administrator moving, editing or deleting a demand', async () => {
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.admin());
    const target = list.body.data.find((d: { status: string }) => d.status !== 'PRODUCTION');

    const move = await request(app)
      .patch(`/api/v1/demands/${target.uuid}/status`)
      .set('Cookie', AS.admin())
      .send({ status: 'PAUSED' });
    expect(move.status).toBe(403);

    const edit = await request(app)
      .patch(`/api/v1/demands/${target.uuid}`)
      .set('Cookie', AS.admin())
      .send({ title: 'Alterado' });
    expect(edit.status).toBe(403);

    const remove = await request(app)
      .delete(`/api/v1/demands/${target.uuid}`)
      .set('Cookie', AS.admin());
    expect(remove.status).toBe(403);
  });

  it('refuses a developer deleting a demand but allows editing', async () => {
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.dev());
    const target = list.body.data.find((d: { status: string }) => d.status !== 'PRODUCTION');

    const remove = await request(app).delete(`/api/v1/demands/${target.uuid}`).set('Cookie', AS.dev());
    expect(remove.status).toBe(403);

    const edit = await request(app)
      .patch(`/api/v1/demands/${target.uuid}`)
      .set('Cookie', AS.dev())
      .send({ description: target.description });
    expect(edit.status).toBe(200);
  });

  it('refuses an agilista creating a user', async () => {
    const response = await request(app)
      .post('/api/v1/users')
      .set('Cookie', AS.agilista())
      .send({ name: 'Pessoa Teste', roleUuid: SEED_UUIDS.roles.desenvolvedor });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('refuses a developer listing users', async () => {
    const response = await request(app).get('/api/v1/users').set('Cookie', AS.dev());
    expect(response.status).toBe(403);
  });
});

describe('Assignee eligibility', () => {
  it('lists only eligible users, excluding administrators', async () => {
    const response = await request(app)
      .get(`/api/v1/projects/${SEED_UUIDS.projects.portalCliente}/eligible-assignees`)
      .set('Cookie', AS.agilista());

    expect(response.status).toBe(200);
    const names = response.body.data.map((u: { name: string }) => u.name);
    // Administradores lack DEMAND_BE_ASSIGNEE.
    expect(names).not.toContain('Mariana Alves');
    expect(names).toContain('Lucas Barbosa');
  });

  it('rejects a responsible from a different project', async () => {
    const response = await request(app)
      .post(`/api/v1/projects/${SEED_UUIDS.projects.portalCliente}/demands`)
      .set('Cookie', AS.agilista())
      .send({
        title: 'Demanda com responsável inválido',
        description: 'Teste de elegibilidade.',
        dueDate: '2026-12-31',
        // Sofia only belongs to Plataforma de Dados.
        responsibleUuid: SEED_UUIDS.users.sofiaLimaBraga,
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('RESPONSIBLE_NOT_PROJECT_MEMBER');
  });

  it('rejects an administrator as responsible', async () => {
    const response = await request(app)
      .post(`/api/v1/projects/${SEED_UUIDS.projects.portalCliente}/demands`)
      .set('Cookie', AS.agilista())
      .send({
        title: 'Demanda para administrador',
        description: 'Teste de capacidade.',
        dueDate: '2026-12-31',
        responsibleUuid: SEED_UUIDS.users.marianaAlves,
      });

    expect(response.status).toBe(422);
    expect(['RESPONSIBLE_CANNOT_BE_ASSIGNEE', 'RESPONSIBLE_NOT_PROJECT_MEMBER']).toContain(
      response.body.error.code,
    );
  });
});

/**
 * A demand can exist before anyone decides where it belongs.
 *
 * What the project actually governs is the responsible: attached, only the people
 * allocated there; detached, anyone who may hold a demand at all. These tests fix both
 * halves of that, plus the transition between them — attaching a project afterwards has
 * to refuse a responsible who does not belong to it, which is what the frontend's
 * "o responsável não faz parte do projeto" reset is protecting the operator from.
 */
describe('Demands without a project', () => {
  /*
   * A project-less demand is outside every project boundary by definition, so it shows
   * up for every actor who reads the whole board. That is the correct behaviour and it
   * is also why these are cleaned up: leaving them behind would quietly widen the data
   * the *other* suites assert project isolation against.
   */
  const created: string[] = [];

  const createDetached = async (title: string) => {
    const response = await request(app)
      .post('/api/v1/demands')
      .set('Cookie', AS.agilista())
      .send({
        title,
        description: 'Registrada antes de decidir onde ela entra.',
        dueDate: '2026-12-31',
        // Joana shares no project with Sofia, so only the absence of a project can
        // make this assignment legal.
        responsibleUuid: SEED_UUIDS.users.sofiaLimaBraga,
      });
    if (response.status === 201) {
      created.push(response.body.data.uuid);
    }
    return response;
  };

  afterAll(async () => {
    for (const uuid of created) {
      await request(app).delete(`/api/v1/demands/${uuid}`).set('Cookie', AS.agilista());
    }
  });

  it('lists every eligible user when no project scopes the question', async () => {
    const scoped = await request(app)
      .get(`/api/v1/demands/assignees?projectUuid=${SEED_UUIDS.projects.portalCliente}`)
      .set('Cookie', AS.agilista());
    const unscoped = await request(app)
      .get('/api/v1/demands/assignees')
      .set('Cookie', AS.agilista());

    expect(scoped.status).toBe(200);
    expect(unscoped.status).toBe(200);

    const scopedNames = scoped.body.data.map((u: { name: string }) => u.name);
    const unscopedNames = unscoped.body.data.map((u: { name: string }) => u.name);

    // Sofia only belongs to Plataforma de Dados, so the project scopes her out and the
    // absence of a project scopes her back in.
    expect(scopedNames).not.toContain('Sofia Lima Braga');
    expect(unscopedNames).toContain('Sofia Lima Braga');
    // Capability still applies either way: an Administrador lacks DEMAND_BE_ASSIGNEE.
    expect(unscopedNames).not.toContain('Mariana Alves');
  });

  it('creates a demand with no project and any eligible responsible', async () => {
    const response = await createDetached('Demanda sem projeto');
    expect(response.status).toBe(201);
    const uuid = response.body.data.uuid as string;

    const read = await request(app).get(`/api/v1/demands/${uuid}`).set('Cookie', AS.agilista());
    expect(read.status).toBe(200);
    expect(read.body.data.project).toBeNull();

    // And it is on the board: nothing about having no project hides it.
    const board = await request(app).get('/api/v1/demands').set('Cookie', AS.agilista());
    expect((board.body.data as { uuid: string }[]).some((d) => d.uuid === uuid)).toBe(true);

    // Filtering by a project excludes it, though — it is not in that project.
    const filtered = await request(app)
      .get(`/api/v1/demands?projectUuid=${SEED_UUIDS.projects.portalCliente}`)
      .set('Cookie', AS.agilista());
    expect((filtered.body.data as { uuid: string }[]).some((d) => d.uuid === uuid)).toBe(false);
  });

  it('refuses to attach a project the responsible does not belong to', async () => {
    const response = await createDetached('Demanda sem projeto, para anexar depois');
    expect(response.status).toBe(201);
    const uuid = response.body.data.uuid as string;

    const attached = await request(app)
      .patch(`/api/v1/demands/${uuid}`)
      .set('Cookie', AS.agilista())
      .send({ projectUuid: SEED_UUIDS.projects.portalCliente });

    expect(attached.status).toBe(422);
    expect(attached.body.error.code).toBe('RESPONSIBLE_NOT_PROJECT_MEMBER');

    // Refused in full: the demand must still have no project.
    const after = await request(app).get(`/api/v1/demands/${uuid}`).set('Cookie', AS.agilista());
    expect(after.body.data.project).toBeNull();
  });

  it('attaches the project when a responsible allocated to it comes along', async () => {
    const response = await createDetached('Demanda sem projeto, anexada com responsável válido');
    expect(response.status).toBe(201);
    const uuid = response.body.data.uuid as string;

    const attached = await request(app)
      .patch(`/api/v1/demands/${uuid}`)
      .set('Cookie', AS.agilista())
      .send({
        projectUuid: SEED_UUIDS.projects.portalCliente,
        responsibleUuid: SEED_UUIDS.users.lucasBarbosa,
      });
    expect(attached.status).toBe(200);

    // And detaching it again is a decision the API accepts, not an error.
    const detached = await request(app)
      .patch(`/api/v1/demands/${uuid}`)
      .set('Cookie', AS.agilista())
      .send({ projectUuid: null });
    expect(detached.status).toBe(200);

    const after = await request(app).get(`/api/v1/demands/${uuid}`).set('Cookie', AS.agilista());
    expect(after.body.data.project).toBeNull();
  });
});

describe('Usuários (GET /users/page)', () => {
  it('pages the listing and reports the total up front', async () => {
    const first = await request(app)
      .get('/api/v1/users/page?limit=3&page=1')
      .set('Cookie', AS.admin());

    expect(first.status).toBe(200);
    expect(first.body.data.items).toHaveLength(3);
    expect(first.body.data.total).toBeGreaterThanOrEqual(8);
    expect(first.body.data.totalPages).toBe(Math.ceil(first.body.data.total / 3));

    const second = await request(app)
      .get('/api/v1/users/page?limit=3&page=2')
      .set('Cookie', AS.admin());
    const firstUuids = first.body.data.items.map((u: { uuid: string }) => u.uuid);
    const secondUuids = second.body.data.items.map((u: { uuid: string }) => u.uuid);
    expect(secondUuids.some((uuid: string) => firstUuids.includes(uuid))).toBe(false);
  });

  it('filters by perfil and by situação, and carries the avatar', async () => {
    const byRole = await request(app)
      .get(`/api/v1/users/page?roleUuid=${SEED_UUIDS.roles.desenvolvedor}&limit=100`)
      .set('Cookie', AS.admin());

    expect(byRole.status).toBe(200);
    expect(byRole.body.data.items.length).toBeGreaterThan(0);
    for (const user of byRole.body.data.items as { role: { slug: string } }[]) {
      expect(user.role.slug).toBe('desenvolvedor');
    }
    // The seed gives every user a portrait; the field has to survive to the API.
    expect(byRole.body.data.items[0].avatarUrl).toBeTruthy();

    // Tri-state, not an "only active" flag: asking for the inactive ones is a question
    // the screen has to be able to ask.
    const inactive = await request(app)
      .get('/api/v1/users/page?active=false&limit=100')
      .set('Cookie', AS.admin());
    expect(inactive.status).toBe(200);
    for (const user of inactive.body.data.items as { active: boolean }[]) {
      expect(user.active).toBe(false);
    }
  });

  it('requires USER_ACCESS', async () => {
    const response = await request(app).get('/api/v1/users/page').set('Cookie', AS.dev());
    expect(response.status).toBe(403);
  });
});

describe('Self-service profile (PATCH /users/me)', () => {
  // Restored after each test: this suite edits the signed-in seed user's own row.
  // The avatar goes back to the seeded picture, not to `null` — leaving it cleared
  // would silently strip Lucas of his seeded photo for every later run against this
  // database, which is exactly the drift `npm run db:seed` exists to repair but that a
  // stray leftover from this suite should never have caused in the first place.
  const LUCAS_SEEDED_AVATAR = 'https://randomuser.me/api/portraits/men/11.jpg';
  const restore = async (cookie: string, name: string) => {
    await request(app)
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ name, avatarUrl: LUCAS_SEEDED_AVATAR });
  };

  it('updates the caller\'s own name and picture, no permission beyond being signed in', async () => {
    const cookie = AS.dev();
    try {
      const response = await request(app)
        .patch('/api/v1/users/me')
        .set('Cookie', cookie)
        .send({ name: 'Lucas Barbosa Neto', avatarUrl: 'https://example.test/lucas.jpg' });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Lucas Barbosa Neto');
      expect(response.body.data.avatarUrl).toBe('https://example.test/lucas.jpg');

      const session = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
      expect(session.body.data.user.name).toBe('Lucas Barbosa Neto');
      expect(session.body.data.user.avatarUrl).toBe('https://example.test/lucas.jpg');
    } finally {
      await restore(cookie, 'Lucas Barbosa');
    }
  });

  it('clears the picture with an empty string, the same as null', async () => {
    const cookie = AS.dev();
    try {
      await request(app)
        .patch('/api/v1/users/me')
        .set('Cookie', cookie)
        .send({ avatarUrl: 'https://example.test/temp.jpg' });

      const cleared = await request(app)
        .patch('/api/v1/users/me')
        .set('Cookie', cookie)
        .send({ avatarUrl: '' });
      expect(cleared.status).toBe(200);
      expect(cleared.body.data.avatarUrl).toBeNull();
    } finally {
      await restore(cookie, 'Lucas Barbosa');
    }
  });

  it('never accepts a role or an activation change through this endpoint', async () => {
    const cookie = AS.dev();
    const response = await request(app)
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      // Fields the schema does not declare are simply dropped, not rejected — the
      // request still succeeds, but nothing about role or activation moves.
      .send({ name: 'Lucas Barbosa', roleUuid: SEED_UUIDS.roles.administrador, active: false });

    expect(response.status).toBe(200);
    const session = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(session.body.data.role.slug).toBe('desenvolvedor');
    expect(session.status).toBe(200);
  });

  it('rejects an invalid picture URL', async () => {
    const cookie = AS.dev();
    const response = await request(app)
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ avatarUrl: 'not-a-url' });
    expect(response.status).toBe(422);
  });

  it('refuses to rename to a name already in use', async () => {
    const cookie = AS.dev();
    const response = await request(app)
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ name: 'Beatriz Ramos' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('USER_ALREADY_EXISTS');
  });
});

describe('Validation', () => {
  it('rejects a user name containing digits', async () => {
    const response = await request(app)
      .post('/api/v1/users')
      .set('Cookie', AS.admin())
      .send({ name: 'Ana123', roleUuid: SEED_UUIDS.roles.desenvolvedor });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_USER_NAME');
  });

  it('accepts an accented name', async () => {
    const name = `Teste Acentuação ${Date.now()}`.replace(/[0-9]/g, '');
    const response = await request(app)
      .post('/api/v1/users')
      .set('Cookie', AS.admin())
      .send({ name, roleUuid: SEED_UUIDS.roles.desenvolvedor });

    expect([201, 409]).toContain(response.status);
    if (response.status === 201) {
      await prisma.user.deleteMany({ where: { uuid: response.body.data.uuid } });
    }
  });

  it('reports every missing field, not just the first', async () => {
    const response = await request(app).post('/api/v1/users').set('Cookie', AS.admin()).send({});

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const fields = response.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain('name');
    expect(fields).toContain('roleUuid');
  });

  it('rejects an invalid status on a move', async () => {
    const list = await request(app).get('/api/v1/demands').set('Cookie', AS.agilista());
    const response = await request(app)
      .patch(`/api/v1/demands/${list.body.data[0].uuid}/status`)
      .set('Cookie', AS.agilista())
      .send({ status: 'DONE' });

    expect(response.status).toBe(422);
  });

  it('includes a requestId in every error body', async () => {
    const response = await request(app).get('/api/v1/demands');
    expect(response.body.error.requestId).toBeTruthy();
  });
});

describe('Role management and the ACCESS hierarchy', () => {
  it('normalizes a child permission by adding its module ACCESS', async () => {
    const response = await request(app)
      .post('/api/v1/roles/permissions/normalize')
      .set('Cookie', AS.admin())
      .send({ permissions: ['DEMAND_CREATE'] });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(['DEMAND_ACCESS', 'DEMAND_CREATE']);
  });

  it('creates a custom role and persists only the effective set', async () => {
    const name = `Perfil de Teste ${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/roles')
      .set('Cookie', AS.admin())
      .send({ name, permissions: ['DEMAND_UPDATE'] });

    expect(created.status).toBe(201);
    // ACCESS was implied by its child.
    expect(created.body.data.permissions).toContain('DEMAND_ACCESS');
    expect(created.body.data.isSystem).toBe(false);

    await prisma.role.deleteMany({ where: { uuid: created.body.data.uuid } });
  });

  it('refuses to rename a system role', async () => {
    const response = await request(app)
      .patch(`/api/v1/roles/${SEED_UUIDS.roles.administrador}`)
      .set('Cookie', AS.admin())
      .send({ name: 'Super Admin' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('SYSTEM_ROLE_IMMUTABLE');
  });

  it('exposes the permission catalog grouped by module', async () => {
    const response = await request(app)
      .get('/api/v1/roles/permissions/catalog')
      .set('Cookie', AS.admin());

    expect(response.status).toBe(200);
    const modules = response.body.data.map((g: { module: string }) => g.module);
    expect(modules).toEqual(expect.arrayContaining(['DEMAND', 'USER', 'PROJECT', 'ROLE']));
  });
});

describe('Demand lifecycle end to end', () => {
  it('creates, edits, moves and deletes a demand', async () => {
    const created = await request(app)
      .post(`/api/v1/projects/${SEED_UUIDS.projects.portalCliente}/demands`)
      .set('Cookie', AS.agilista())
      .send({
        title: 'Demanda temporária de teste',
        description: 'Criada pelo teste automatizado de integração.',
        dueDate: '2026-11-20',
        responsibleUuid: SEED_UUIDS.users.lucasBarbosa,
      });
    expect(created.status).toBe(201);
    const uuid = created.body.data.uuid;

    const detail = await request(app).get(`/api/v1/demands/${uuid}`).set('Cookie', AS.agilista());
    expect(detail.body.data.status).toBe('NOT_STARTED');
    expect(detail.body.data.dueDate).toBe('2026-11-20');
    expect(detail.body.data.responsible.name).toBe('Lucas Barbosa');
    // Omitted at creation, so it defaults to MEDIUM.
    expect(detail.body.data.priority).toBe('MEDIUM');

    const edited = await request(app)
      .patch(`/api/v1/demands/${uuid}`)
      .set('Cookie', AS.agilista())
      .send({ title: 'Demanda temporária revisada', priority: 'URGENT' });
    expect(edited.status).toBe(200);

    const reread = await request(app).get(`/api/v1/demands/${uuid}`).set('Cookie', AS.agilista());
    expect(reread.body.data.priority).toBe('URGENT');

    const moved = await request(app)
      .patch(`/api/v1/demands/${uuid}/status`)
      .set('Cookie', AS.agilista())
      .send({ status: 'IN_REVIEW' });
    expect(moved.body.data.status).toBe('IN_REVIEW');

    const removed = await request(app).delete(`/api/v1/demands/${uuid}`).set('Cookie', AS.agilista());
    expect(removed.status).toBe(204);

    const gone = await request(app).get(`/api/v1/demands/${uuid}`).set('Cookie', AS.agilista());
    expect(gone.status).toBe(404);
  });

  it('accepts an explicit priority at creation and rejects an unknown one', async () => {
    const created = await request(app)
      .post(`/api/v1/projects/${SEED_UUIDS.projects.portalCliente}/demands`)
      .set('Cookie', AS.agilista())
      .send({
        title: 'Demanda com prioridade explícita',
        description: 'Teste do campo de prioridade na criação.',
        dueDate: '2026-11-20',
        responsibleUuid: SEED_UUIDS.users.lucasBarbosa,
        priority: 'LOW',
      });
    expect(created.status).toBe(201);

    const detail = await request(app)
      .get(`/api/v1/demands/${created.body.data.uuid}`)
      .set('Cookie', AS.agilista());
    expect(detail.body.data.priority).toBe('LOW');

    const invalid = await request(app)
      .post(`/api/v1/projects/${SEED_UUIDS.projects.portalCliente}/demands`)
      .set('Cookie', AS.agilista())
      .send({
        title: 'Demanda com prioridade inválida',
        description: 'Teste de rejeição.',
        dueDate: '2026-11-20',
        responsibleUuid: SEED_UUIDS.users.lucasBarbosa,
        priority: 'CRITICAL',
      });
    expect(invalid.status).toBe(422);

    await request(app)
      .delete(`/api/v1/demands/${created.body.data.uuid}`)
      .set('Cookie', AS.agilista());
  });
});

describe('Demandas history (GET /demands/history)', () => {
  it('pages by offset, ascending due date, no overlap between pages, with a known total', async () => {
    const first = await request(app)
      .get('/api/v1/demands/history')
      .query({ limit: 3, page: 1 })
      .set('Cookie', AS.admin());
    expect(first.status).toBe(200);
    expect(first.body.data.items.length).toBeLessThanOrEqual(3);
    expect(first.body.data.page).toBe(1);
    expect(first.body.data.pageSize).toBe(3);
    expect(typeof first.body.data.total).toBe('number');
    expect(first.body.data.totalPages).toBe(Math.max(1, Math.ceil(first.body.data.total / 3)));

    if (first.body.data.totalPages < 2) {
      return; // Fewer than 4 demands visible — nothing to page through.
    }

    const second = await request(app)
      .get('/api/v1/demands/history')
      .query({ limit: 3, page: 2 })
      .set('Cookie', AS.admin());
    expect(second.status).toBe(200);
    expect(second.body.data.page).toBe(2);
    expect(second.body.data.total).toBe(first.body.data.total);

    const pageOne = first.body.data.items as { uuid: string; dueDate: string }[];
    const pageTwo = second.body.data.items as { uuid: string; dueDate: string }[];
    const seen = new Set(pageOne.map((item) => item.uuid));
    expect(pageTwo.some((item) => seen.has(item.uuid))).toBe(false);

    const dueDates = [...pageOne, ...pageTwo].map((item) => item.dueDate);
    expect(dueDates).toEqual([...dueDates].sort());
  });

  it('never exposes a numeric id and reflects DEMAND_ACCESS project isolation', async () => {
    const response = await request(app)
      .get('/api/v1/demands/history')
      .query({ limit: 50 })
      .set('Cookie', AS.dev());
    expect(response.status).toBe(200);
    for (const item of response.body.data.items) {
      expect('id' in item).toBe(false);
    }
    // Lucas Barbosa (Desenvolvedor) is not allocated to Plataforma de Dados. A demand
    // with no project is outside that boundary rather than inside it, so it is not a
    // counter-example to the isolation this asserts.
    expect(
      response.body.data.items.every(
        (item: { project: { name: string } | null }) =>
          item.project === null || item.project.name !== 'Plataforma de Dados',
      ),
    ).toBe(true);
  });

  it('filters by status, priority and responsible, each narrower than the last', async () => {
    const byStatus = await request(app)
      .get('/api/v1/demands/history')
      .query({ limit: 50, status: 'PRODUCTION' })
      .set('Cookie', AS.admin());
    expect(byStatus.status).toBe(200);
    expect(
      byStatus.body.data.items.every((item: { status: string }) => item.status === 'PRODUCTION'),
    ).toBe(true);

    const byPriority = await request(app)
      .get('/api/v1/demands/history')
      .query({ limit: 50, priority: 'URGENT' })
      .set('Cookie', AS.admin());
    expect(byPriority.status).toBe(200);
    expect(
      byPriority.body.data.items.every((item: { priority: string }) => item.priority === 'URGENT'),
    ).toBe(true);

    const byResponsible = await request(app)
      .get('/api/v1/demands/history')
      .query({ limit: 50, responsibleUuid: SEED_UUIDS.users.lucasBarbosa })
      .set('Cookie', AS.admin());
    expect(byResponsible.status).toBe(200);
    expect(
      byResponsible.body.data.items.every(
        (item: { responsible: { uuid: string } }) => item.responsible.uuid === SEED_UUIDS.users.lucasBarbosa,
      ),
    ).toBe(true);
  });

  it('sorts by due date (default), creation date, or priority', async () => {
    const byDueDate = await request(app)
      .get('/api/v1/demands/history')
      .query({ limit: 50 })
      .set('Cookie', AS.admin());
    const dueDates = byDueDate.body.data.items.map((item: { dueDate: string }) => item.dueDate);
    expect(dueDates).toEqual([...dueDates].sort());

    const byCreatedAt = await request(app)
      .get('/api/v1/demands/history')
      .query({ limit: 50, sort: 'createdAt' })
      .set('Cookie', AS.admin());
    const createdAts = byCreatedAt.body.data.items.map((item: { createdAt: string }) => item.createdAt);
    // Newest first.
    expect(createdAts).toEqual([...createdAts].sort().reverse());

    const byPriority = await request(app)
      .get('/api/v1/demands/history')
      .query({ limit: 50, sort: 'priority' })
      .set('Cookie', AS.admin());
    const priorityRank: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 };
    const ranks = byPriority.body.data.items.map((item: { priority: string }) => priorityRank[item.priority]);
    // Most urgent first.
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
  });
});

describe('Demandas filters (GET /demands/filters)', () => {
  it('lists distinct responsibles, scoped to what the actor can see', async () => {
    const asAdmin = await request(app).get('/api/v1/demands/filters').set('Cookie', AS.admin());
    expect(asAdmin.status).toBe(200);
    const names = asAdmin.body.data.responsibles.map((r: { name: string }) => r.name);
    expect(names).toContain('Lucas Barbosa');
    // Sorted, not insertion order.
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')));

    // Desenvolvedor Lucas is not on Plataforma de Dados, so Sofia — who only appears as
    // responsible there — must not show up in his filter options.
    const asDev = await request(app).get('/api/v1/demands/filters').set('Cookie', AS.dev());
    expect(asDev.status).toBe(200);
    const devNames = asDev.body.data.responsibles.map((r: { name: string }) => r.name);
    expect(devNames).not.toContain('Sofia Lima Braga');
  });
});

describe('Creating directly into a column', () => {
  const payload = (status?: string) => ({
    title: 'Demanda criada direto na coluna',
    description: 'Teste do "+" por coluna do Kanban.',
    dueDate: '2026-11-20',
    responsibleUuid: SEED_UUIDS.users.lucasBarbosa,
    ...(status ? { status } : {}),
  });

  it('starts in NOT_STARTED when no status is sent, same as before this existed', async () => {
    const response = await request(app)
      .post(`/api/v1/projects/${SEED_UUIDS.projects.portalCliente}/demands`)
      .set('Cookie', AS.agilista())
      .send(payload());
    expect(response.status).toBe(201);

    const detail = await request(app)
      .get(`/api/v1/demands/${response.body.data.uuid}`)
      .set('Cookie', AS.agilista());
    expect(detail.body.data.status).toBe('NOT_STARTED');

    const cleaned = await request(app)
      .delete(`/api/v1/demands/${response.body.data.uuid}`)
      .set('Cookie', AS.agilista());
    expect(cleaned.status).toBe(204);
  });

  it('lets someone holding DEMAND_CREATE_WITH_STATUS create straight into another column', async () => {
    // Joana (Agilista) is the seeded profile that holds it.
    const response = await request(app)
      .post(`/api/v1/projects/${SEED_UUIDS.projects.portalCliente}/demands`)
      .set('Cookie', AS.agilista())
      .send(payload('IN_REVIEW'));
    expect(response.status).toBe(201);

    const detail = await request(app)
      .get(`/api/v1/demands/${response.body.data.uuid}`)
      .set('Cookie', AS.agilista());
    expect(detail.body.data.status).toBe('IN_REVIEW');

    const cleaned = await request(app)
      .delete(`/api/v1/demands/${response.body.data.uuid}`)
      .set('Cookie', AS.agilista());
    expect(cleaned.status).toBe(204);
  });

  it('refuses any explicit status for someone without DEMAND_CREATE_WITH_STATUS', async () => {
    // Mariana (Administrador) holds DEMAND_CREATE but not this — an Administrador
    // manages who gets it, by design, rather than holding it herself.
    const before = await prisma.demand.count();
    const response = await request(app)
      .post(`/api/v1/projects/${SEED_UUIDS.projects.portalCliente}/demands`)
      .set('Cookie', AS.admin())
      .send(payload('IN_PROGRESS'));
    try {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PERMISSION_DENIED');
      expect(await prisma.demand.count()).toBe(before);
    } finally {
      // A row left behind by a regression here must not survive the assertion above
      // failing before it: a 201 this test does not expect is still one this suite
      // must not leave in the database for the next run, or for whoever opens the board.
      if (response.status === 201) {
        await prisma.demand.delete({ where: { uuid: response.body.data.uuid } });
      }
    }
  });

  it('never lets a demand be born in production, even for someone holding DEMAND_CREATE_WITH_STATUS', async () => {
    const before = await prisma.demand.count();
    const response = await request(app)
      .post(`/api/v1/projects/${SEED_UUIDS.projects.portalCliente}/demands`)
      .set('Cookie', AS.agilista())
      .send(payload('PRODUCTION'));
    try {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('DEMAND_CANNOT_CREATE_IN_PRODUCTION');
      expect(await prisma.demand.count()).toBe(before);
    } finally {
      if (response.status === 201) {
        await prisma.demand.delete({ where: { uuid: response.body.data.uuid } });
      }
    }
  });
});
