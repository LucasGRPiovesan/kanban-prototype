import { spawnSync } from 'node:child_process';

/**
 * Build step of the frontend project on Vercel (`npm run vercel-build`).
 *
 * The SPA calls the API at the relative path `/api/v1`, and `vercel.json` rewrites that to
 * `$API_ORIGIN` (expanded by Vercel at request time) — so the browser only ever talks to its own origin, the session cookie
 * stays first-party (SameSite=Lax works in every browser, Safari included) and no CORS is
 * involved. Without API_ORIGIN the rewrite would forward to a literal "$API_ORIGIN" and
 * every request would fail at runtime, so the build refuses to continue instead.
 */
const origin = process.env.API_ORIGIN?.trim();
if (!origin) {
  console.error(
    '✖ API_ORIGIN não definida. Configure-a no projeto do frontend na Vercel com a URL de produção da API, ex.: https://kanban-api.vercel.app',
  );
  process.exit(1);
}
if (!/^https:\/\/[^/]+$/.test(origin)) {
  console.error(`✖ API_ORIGIN deve ser só a origem HTTPS, sem caminho nem barra final (recebido: "${origin}").`);
  process.exit(1);
}
if (process.env.VITE_API_BASE_URL && process.env.VITE_API_BASE_URL !== '/api/v1') {
  console.warn(
    `⚠ VITE_API_BASE_URL="${process.env.VITE_API_BASE_URL}" ignora a rewrite de mesma origem; na Vercel deixe-a vazia.`,
  );
}

// The routing rules themselves, compiled the way the platform compiles them.
const check = spawnSync(process.execPath, ['scripts/check-vercel-config.mjs'], { stdio: 'inherit' });
if (check.status !== 0) {
  process.exit(check.status ?? 1);
}

const result = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
