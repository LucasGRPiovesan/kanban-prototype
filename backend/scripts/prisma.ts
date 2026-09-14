import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveDatabaseUrl } from '../src/shared/infrastructure/database-url';

/**
 * Runs the Prisma CLI with the same connection rules as the API.
 *
 * The CLI reads `DATABASE_URL` straight from the environment, so a managed MySQL that needs
 * a CA certificate (DATABASE_CA_CERT) would otherwise connect differently from the running
 * app. This wrapper resolves the URL once — see `database-url.ts` — and hands it over.
 *
 *   tsx scripts/prisma.ts migrate deploy
 */
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Uso: tsx scripts/prisma.ts <comando do prisma>');
  process.exit(2);
}

const env: NodeJS.ProcessEnv = { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' };
if (process.env.DATABASE_URL) {
  env.DATABASE_URL = resolveDatabaseUrl(process.env.DATABASE_URL, process.env.DATABASE_CA_CERT);
}

const cli = path.resolve(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');
const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', env });
process.exit(result.status ?? 1);
