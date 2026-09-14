import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demandUuidOf, SEED_UUIDS } from '../../prisma/seed-data';
import { loadEnv } from '../../src/config/env';
import { createApp } from '../../src/main/app';
import { buildDependencies } from '../../src/main/composition-root';

/**
 * The demand-integration API, end to end: generating credentials, exchanging them for
 * an access token, writing demands with that token, and the isolation and revocation
 * rules that make the whole thing safe to hand to a third party.
 */

const API = '/api/v1';
const PROJECT = SEED_UUIDS.projects.portalCliente;
const OTHER_PROJECT = SEED_UUIDS.projects.appLogistica;
const RESPONSIBLE = SEED_UUIDS.users.lucasBarbosa; // member of portalCliente

let app: Express;
let prisma: PrismaClient;
let adminCookie: string;
let devCookie: string;
/** Agilista on Portal do Cliente — holds DEMAND_DELETE, which the Administrador does not. */
let agilistaCookie: string;

async function login(userUuid: string): Promise<string> {
  const response = await request(app).post(`${API}/auth/login`).send({ userUuid });
  expect(response.status).toBe(200);
  const cookies = response.headers['set-cookie'] as unknown as string[];
  return cookies.map((value) => value.split(';')[0]).join('; ');
}

async function generateCredentials(projectUuid: string, cookie = adminCookie) {
  const response = await request(app)
    .post(`${API}/projects/${projectUuid}/integration/credentials`)
    .set('Cookie', cookie);
  expect(response.status).toBe(201);
  return response.body.data as { apiKey: string; apiSecret: string };
}

async function issueToken(apiKey: string, apiSecret: string) {
  return request(app).post(`${API}/integration/auth/token`).send({ apiKey, apiSecret });
}

async function revoke(projectUuid: string, cookie = adminCookie) {
  return request(app).delete(`${API}/projects/${projectUuid}/integration/credentials`).set('Cookie', cookie);
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  const env = loadEnv();
  prisma = new PrismaClient();
  app = createApp(env, buildDependencies(env, prisma));

  adminCookie = await login(SEED_UUIDS.users.marianaAlves);
  // Desenvolvedor on Portal do Cliente: PROJECT_ACCESS but no PROJECT_MANAGE_INTEGRATION.
  devCookie = await login(SEED_UUIDS.users.lucasBarbosa);
  agilistaCookie = await login(SEED_UUIDS.users.joanaMartins);
});

afterAll(async () => {
  // Leave no credential behind for the next suite run against this database.
  await revoke(PROJECT).catch(() => undefined);
  await prisma.$disconnect();
});

describe('Credential management', () => {
  it('reports unconfigured, generates once, and never returns the secret again', async () => {
    const before = await request(app).get(`${API}/projects/${PROJECT}/integration`).set('Cookie', adminCookie);
    expect(before.status).toBe(200);
    expect(before.body.data.configured).toBe(false);

    const generated = await generateCredentials(PROJECT);
    expect(generated.apiKey).toMatch(/^csp_key_/);
    expect(generated.apiSecret).toMatch(/^csp_secret_/);

    const status = await request(app).get(`${API}/projects/${PROJECT}/integration`).set('Cookie', adminCookie);
    expect(status.status).toBe(200);
    expect(status.body.data).toMatchObject({ configured: true, apiKey: generated.apiKey });
    expect(status.body.data.apiSecret).toBeUndefined();
    expect(JSON.stringify(status.body.data)).not.toContain(generated.apiSecret);
  });

  it('is closed to a profile without PROJECT_MANAGE_INTEGRATION, on any project', async () => {
    const ownProject = await request(app)
      .post(`${API}/projects/${PROJECT}/integration/credentials`)
      .set('Cookie', devCookie);
    expect(ownProject.status).toBe(403);

    const otherProject = await request(app)
      .get(`${API}/projects/${OTHER_PROJECT}/integration`)
      .set('Cookie', devCookie);
    expect(otherProject.status).toBe(403);
  });
});

describe('Token exchange', () => {
  it('issues a bearer token for the right pair and the identical error for a wrong one', async () => {
    const { apiKey, apiSecret } = await generateCredentials(PROJECT);

    const ok = await issueToken(apiKey, apiSecret);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ tokenType: 'Bearer' });
    expect(typeof ok.body.data.accessToken).toBe('string');
    expect(ok.body.data.expiresIn).toBeGreaterThan(0);

    const wrongSecret = await issueToken(apiKey, 'csp_secret_wrong');
    const wrongKey = await issueToken('csp_key_' + '0'.repeat(40), apiSecret);
    expect(wrongSecret.status).toBe(401);
    expect(wrongKey.status).toBe(401);
    expect(wrongSecret.body.error.code).toBe(wrongKey.body.error.code);
    expect(wrongSecret.body.error.code).toBe('INTEGRATION_INVALID_CREDENTIALS');
  });

  it('never accepts a user-session cookie or JWT on the integration API', async () => {
    // The session token has no `pro`/`cred`/`typ` claims, so it must fail the same way
    // a garbled string would — not be silently accepted because it is a valid JWT.
    const sessionToken = adminCookie.split('=')[1]?.split(';')[0] ?? '';
    const response = await request(app)
      .post(`${API}/integration/demands`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({});
    expect(response.status).toBe(401);
  });
});

describe('Writing demands through the integration', () => {
  it('creates, edits and moves a demand scoped to the credential’s own project', async () => {
    const { apiKey, apiSecret } = await generateCredentials(PROJECT);
    const { body } = await issueToken(apiKey, apiSecret);
    const bearer = `Bearer ${body.data.accessToken}`;

    const created = await request(app)
      .post(`${API}/integration/demands`)
      .set('Authorization', bearer)
      .send({
        title: 'Demanda criada via integração',
        description: 'Aberta por um sistema externo.',
        dueDate: '2026-12-31',
        responsibleUuid: RESPONSIBLE,
      });
    expect(created.status).toBe(201);
    const demandUuid = created.body.data.uuid as string;

    const updated = await request(app)
      .patch(`${API}/integration/demands/${demandUuid}`)
      .set('Authorization', bearer)
      .send({ title: 'Demanda renomeada via integração' });
    expect(updated.status).toBe(200);

    const moved = await request(app)
      .patch(`${API}/integration/demands/${demandUuid}/status`)
      .set('Authorization', bearer)
      .send({ status: 'IN_PROGRESS' });
    expect(moved.status).toBe(200);
    expect(moved.body.data.status).toBe('IN_PROGRESS');

    // The activity trail attributes the writes to the credential, not to a person —
    // and it is visible from the demand's own history, exactly like a human edit.
    const history = await request(app)
      .get(`${API}/demands/${demandUuid}/history`)
      .set('Cookie', adminCookie);
    expect(history.status).toBe(200);
    const actorNames = (history.body.data.items as { actor: { name: string } | null }[]).map(
      (item) => item.actor?.name,
    );
    expect(actorNames.every((name) => name?.startsWith('Integração'))).toBe(true);

    // Cleanup: delete via the normal session API so the seed's row count stays honest —
    // and assert it, so a cleanup that silently fails cannot leave rows behind again.
    const removed = await request(app).delete(`${API}/demands/${demandUuid}`).set('Cookie', agilistaCookie);
    expect(removed.status).toBe(204);
  });

  it('refuses to create a demand directly in production', async () => {
    const { apiKey, apiSecret } = await generateCredentials(PROJECT);
    const { body } = await issueToken(apiKey, apiSecret);

    const before = await prisma.demand.count();
    const response = await request(app)
      .post(`${API}/integration/demands`)
      .set('Authorization', `Bearer ${body.data.accessToken}`)
      .send({
        title: 'Demanda já entregue',
        description: 'Tentativa de nascer em produção.',
        dueDate: '2026-12-31',
        responsibleUuid: RESPONSIBLE,
        status: 'PRODUCTION',
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INTEGRATION_CANNOT_CREATE_IN_PRODUCTION');
    expect(await prisma.demand.count()).toBe(before);
  });

  it('rejects a responsible who is not eligible in the target project', async () => {
    const { apiKey, apiSecret } = await generateCredentials(PROJECT);
    const { body } = await issueToken(apiKey, apiSecret);

    const response = await request(app)
      .post(`${API}/integration/demands`)
      .set('Authorization', `Bearer ${body.data.accessToken}`)
      .send({
        title: 'Não deveria ser criada',
        description: 'x',
        dueDate: '2026-12-31',
        // Sofia is not a member of Portal do Cliente.
        responsibleUuid: SEED_UUIDS.users.sofiaLimaBraga,
      });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('RESPONSIBLE_NOT_PROJECT_MEMBER');
  });

  it("cannot reach another project's demand", async () => {
    const { apiKey, apiSecret } = await generateCredentials(PROJECT);
    const { body } = await issueToken(apiKey, apiSecret);

    const foreignDemand = demandUuidOf('logistica-roteirizacao'); // App de Logística
    const response = await request(app)
      .patch(`${API}/integration/demands/${foreignDemand}`)
      .set('Authorization', `Bearer ${body.data.accessToken}`)
      .send({ title: 'Não deveria alcançar' });
    expect(response.status).toBe(404);
  });

  it('refuses to touch a demand in production, same as the session API', async () => {
    const { apiKey, apiSecret } = await generateCredentials(PROJECT);
    const { body } = await issueToken(apiKey, apiSecret);
    const production = demandUuidOf('portal-notificacoes'); // portalCliente, PRODUCTION

    const response = await request(app)
      .patch(`${API}/integration/demands/${production}/status`)
      .set('Authorization', `Bearer ${body.data.accessToken}`)
      .send({ status: 'IN_PROGRESS' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('DEMAND_IN_PRODUCTION_IS_TERMINAL');
  });
});

describe('Rotation and revocation take effect immediately', () => {
  it('invalidates every previously issued token the instant credentials are regenerated', async () => {
    const first = await generateCredentials(PROJECT);
    const { body: firstToken } = await issueToken(first.apiKey, first.apiSecret);

    const second = await generateCredentials(PROJECT);
    expect(second.apiKey).not.toBe(first.apiKey);

    const staleCall = await request(app)
      .post(`${API}/integration/demands`)
      .set('Authorization', `Bearer ${firstToken.data.accessToken}`)
      .send({ title: 'x', description: 'x', dueDate: '2026-12-31', responsibleUuid: RESPONSIBLE });
    expect(staleCall.status).toBe(401);
    expect(staleCall.body.error.code).toBe('INTEGRATION_TOKEN_INVALID');

    // The old key is gone entirely, not just its token.
    const oldKeyAuth = await issueToken(first.apiKey, first.apiSecret);
    expect(oldKeyAuth.status).toBe(401);
  });

  it('revoking removes the credential and stops the token endpoint from issuing again', async () => {
    const { apiKey, apiSecret } = await generateCredentials(PROJECT);
    expect((await revoke(PROJECT)).status).toBe(204);

    const status = await request(app).get(`${API}/projects/${PROJECT}/integration`).set('Cookie', adminCookie);
    expect(status.body.data.configured).toBe(false);

    const afterRevoke = await issueToken(apiKey, apiSecret);
    expect(afterRevoke.status).toBe(401);

    // Revoking again, with nothing configured, is a no-op rather than an error.
    expect((await revoke(PROJECT)).status).toBe(204);
  });
});
