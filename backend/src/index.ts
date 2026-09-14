import type express from 'express';
import { loadEnv } from './config/env';
import { buildDependencies } from './main/composition-root';
import { createApp } from './main/app';
import { prismaClient } from './shared/infrastructure/prisma';

/**
 * Serverless entry point — the file Vercel's Express integration looks for (`src/index.ts`
 * exporting the app as its default export).
 *
 * Differs from `main/server.ts` only in what it leaves out: no `listen` (the platform owns
 * the socket) and no explicit `$connect` (Prisma connects lazily on the first query, which
 * keeps a cold start from paying for a connection an OPTIONS preflight never needs). The
 * module is evaluated once per instance, so the dependency graph and its connection pool
 * are reused by every request that instance serves.
 *
 * Configuration is validated here, at load: a missing variable fails the deployment's
 * first request loudly instead of surfacing as a confusing error deep in a use case.
 */
const env = loadEnv();
const app: express.Express = createApp(env, buildDependencies(env, prismaClient()));

export default app;
