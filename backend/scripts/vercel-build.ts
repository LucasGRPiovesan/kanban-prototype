import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { planVercelBuild } from './vercel-build-plan';

/**
 * Build step of the API project on Vercel (`npm run vercel-build`).
 *
 * Every environment generates the Prisma client for the build machine's platform — the
 * same Linux family the functions run on. Only **Production** then:
 *   1. applies pending migrations (`prisma migrate deploy`), before the new deployment
 *      receives traffic, so code never runs against an older schema;
 *   2. runs the idempotent seed, unless SEED_ON_DEPLOY=false.
 * Preview and custom environments never touch the database — see vercel-build-plan.ts.
 *
 * The TypeScript itself is compiled by Vercel from `src/index.ts`; nothing to emit here.
 */
const root = path.resolve(__dirname, '..');
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function run(label: string, args: string[]): void {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: root, env: process.env });
  if (result.status !== 0) {
    console.error(`✖ ${label} falhou (código ${result.status ?? 'desconhecido'}).`);
    process.exit(result.status ?? 1);
  }
}

const plan = planVercelBuild(process.env);
console.log(`Ambiente de deploy: ${plan.environment} — etapas: ${plan.steps.join(', ')}`);
plan.notes.forEach((note) => console.log(`ℹ ${note}`));

if (plan.steps.includes('migrate') && !process.env.DATABASE_URL) {
  console.error('✖ DATABASE_URL não definida para Production: configure-a nas variáveis do projeto na Vercel.');
  process.exit(1);
}

run('Gerando o Prisma Client', [tsx, 'scripts/prisma.ts', 'generate']);
if (plan.steps.includes('migrate')) {
  run('Aplicando migrations', [tsx, 'scripts/prisma.ts', 'migrate', 'deploy']);
}
if (plan.steps.includes('seed')) {
  run('Executando seed (idempotente)', [tsx, 'prisma/seed.ts']);
}
