import { type NextFunction, type Request, type Response } from 'express';
import { DomainError } from '../domain/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for the cookie-authenticated API.
 *
 * The session travels in a cookie, so a page on another site could make the browser send
 * a state-changing request that carries it. SameSite=Lax already stops that in modern
 * browsers; this is the second, server-side layer, and it does not depend on cookie
 * attributes being configured correctly in every deployment.
 *
 * The rule is the one OWASP recommends for this shape of app — verify the `Origin` header:
 * - safe methods (GET/HEAD/OPTIONS) change nothing and pass;
 * - a request with no `Origin` passes: browsers always send it on cross-origin
 *   POST/PUT/PATCH/DELETE (fetch and form submissions alike), so its absence means a
 *   non-browser client (tests, curl, Swagger's server-side calls) — which cannot carry a
 *   victim's cookie in the first place;
 * - otherwise the origin must be an allowed frontend origin, or the API's own host (Swagger
 *   UI served from the API, or a same-origin proxy/rewrite in front of it).
 *
 * Deliberately not applied to the integration API, which authenticates with a bearer
 * token a browser never attaches on its own.
 */
export function originGuard(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins.map(normalizeOrigin).filter((origin) => origin !== null));

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = req.get('origin');
    if (origin === undefined) {
      next();
      return;
    }
    const normalized = normalizeOrigin(origin);
    if (normalized !== null && (allowed.has(normalized) || isOwnHost(normalized, req))) {
      next();
      return;
    }
    next(
      DomainError.forbidden('ORIGIN_NOT_ALLOWED', 'Origem da requisição não permitida.'),
    );
  };
}

/** `scheme://host[:port]`, lower-cased; null for `"null"` (sandboxed frames) or garbage. */
function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Same host as the request itself — Swagger UI served by the API, or a reverse proxy that
 * forwards the browser's host in `X-Forwarded-Host` (a self-hosted nginx in front of both).
 * Vercel does **not** do that across projects: behind the frontend's rewrite, both `Host`
 * and `X-Forwarded-Host` name the API deployment, so the frontend's domain has to be listed
 * in CORS_ORIGIN. A cross-site page cannot forge either header without a CORS preflight the
 * API refuses.
 */
function isOwnHost(origin: string, req: Request): boolean {
  const host = new URL(origin).host;
  const forwarded = req.get('x-forwarded-host')?.split(',')[0]?.trim().toLowerCase();
  const direct = req.get('host')?.toLowerCase();
  return host === forwarded || host === direct;
}
