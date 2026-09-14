import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_UUIDS } from '../../prisma/seed-data';
import { loadEnv } from '../../src/config/env';
import { createApp } from '../../src/main/app';
import { buildDependencies } from '../../src/main/composition-root';
import { revokeTemporarily } from './support/role-permissions';

const API = '/api/v1';

let app: Express;
let prisma: PrismaClient;
// The seeded Agilista reads every project (PROJECT_ACCESS_ALL); this suite needs her bounded
// by allocation to exercise project isolation, so it narrows the role for its own duration.
let restoreAgilista: () => Promise<void> = async () => undefined;
const cookie = { admin: '', agilista: '', dev: '' };

async function login(userUuid: string): Promise<string> {
  const response = await request(app).post(`${API}/auth/login`).send({ userUuid });
  expect(response.status).toBe(200);
  const cookies = response.headers['set-cookie'] as unknown as string[];
  return cookies.map((value) => value.split(';')[0]).join('; ');
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
  cookie.agilista = await login(SEED_UUIDS.users.joanaMartins);
  cookie.dev = await login(SEED_UUIDS.users.lucasBarbosa);
});

afterAll(async () => {
  await restoreAgilista();
  await prisma.$disconnect();
});

describe('Dashboard', () => {
  it('counts exactly the demands the actor can list, with consistent totals', async () => {
    for (const session of [cookie.admin, cookie.dev]) {
      const [dashboard, demands] = await Promise.all([
        request(app).get(`${API}/dashboard`).set('Cookie', session),
        request(app).get(`${API}/demands`).set('Cookie', session),
      ]);
      expect(dashboard.status).toBe(200);
      const data = dashboard.body.data;
      expect(data.summary.total).toBe(demands.body.data.length);
      expect(
        data.statusDistribution.reduce((sum: number, entry: { count: number }) => sum + entry.count, 0),
      ).toBe(data.summary.total);
      expect(
        data.dueBuckets.reduce((sum: number, entry: { count: number }) => sum + entry.count, 0),
      ).toBe(data.summary.open);
      expect(data.weekly).toHaveLength(8);
      expect(keysOf(data).has('id')).toBe(false);
    }
  });

  it('shows the seeded late work to an administrator', async () => {
    const response = await request(app).get(`${API}/dashboard`).set('Cookie', cookie.admin);
    expect(response.body.data.summary.overdue).toBeGreaterThanOrEqual(2);
    expect(response.body.data.attention.length).toBeGreaterThanOrEqual(2);
    expect(response.body.data.flow.throughput.current).toBeGreaterThanOrEqual(1);
  });

  it("limits a developer to the projects he is allocated to", async () => {
    const response = await request(app).get(`${API}/dashboard`).set('Cookie', cookie.dev);
    const names = (response.body.data.projects as { project: { name: string } }[])
      .map((entry) => entry.project.name)
      .sort();
    expect(names).toEqual(['App de Logística', 'Portal do Cliente']);
  });

  it('scopes to one project and hides a project the actor cannot reach', async () => {
    const own = await request(app)
      .get(`${API}/dashboard`)
      .query({ projectUuid: SEED_UUIDS.projects.portalCliente, period: '90' })
      .set('Cookie', cookie.agilista);
    expect(own.status).toBe(200);
    expect(own.body.data.period.days).toBe(90);
    expect(own.body.data.scope.projectUuid).toBe(SEED_UUIDS.projects.portalCliente);
    expect(own.body.data.projects).toHaveLength(1);

    const foreign = await request(app)
      .get(`${API}/dashboard`)
      .query({ projectUuid: SEED_UUIDS.projects.appLogistica })
      .set('Cookie', cookie.agilista);
    expect(foreign.status).toBe(404);
  });

  it('rejects an unsupported period and an anonymous caller', async () => {
    const badPeriod = await request(app).get(`${API}/dashboard`).query({ period: '45' }).set('Cookie', cookie.admin);
    expect(badPeriod.status).toBe(422);
    expect((await request(app).get(`${API}/dashboard`)).status).toBe(401);
  });
});
