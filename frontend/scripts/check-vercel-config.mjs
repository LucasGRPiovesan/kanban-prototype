import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getTransformedRoutes } from '@vercel/routing-utils';

/**
 * Compiles vercel.json with Vercel's own routing library — the step the platform performs
 * on deploy — and asserts the result. A syntax the dashboard accepts but the router mangles
 * fails here instead of in production. It happened once: `${API_ORIGIN}` compiles to
 * `$%7BAPI_ORIGIN%7D` and is never expanded; only `$API_ORIGIN`, listed in the rewrite's
 * `env` allowlist, survives compilation.
 *
 * Runs in `npm run vercel-build` and on demand with `npm run check:vercel`.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.resolve(here, '..', 'vercel.json'), 'utf8'));
const { routes, error } = getTransformedRoutes({ rewrites: config.rewrites, headers: config.headers });

const failures = [];
if (error) {
  failures.push(`vercel.json não compila: ${JSON.stringify(error)}`);
} else {
  const serialized = JSON.stringify(routes);
  const api = routes.find((route) => Array.isArray(route.env) && route.env.includes('API_ORIGIN'));
  if (!api || api.dest !== '$API_ORIGIN/api/$1') {
    failures.push(`rewrite de /api compilou para ${JSON.stringify(api)}; esperado dest "$API_ORIGIN/api/$1" com env ["API_ORIGIN"].`);
  }
  if (serialized.includes('%7B')) {
    failures.push('um destino contém "${...}" codificado — use $VAR sem chaves.');
  }
  const apiIndex = routes.indexOf(api);
  const spaIndex = routes.findIndex((route) => route.dest === '/index.html');
  const filesystemIndex = routes.findIndex((route) => route.handle === 'filesystem');
  if (filesystemIndex < 0 || spaIndex < 0 || spaIndex < apiIndex) {
    failures.push('o fallback de SPA precisa vir depois do filesystem e da rewrite de /api.');
  }
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`✖ ${failure}`));
  process.exit(1);
}
console.log('✔ vercel.json: rewrite /api → $API_ORIGIN e fallback de SPA compilam como esperado.');
