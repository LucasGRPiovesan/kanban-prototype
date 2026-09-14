import { type NextFunction, type Request, type Response } from 'express';
import { type Actor } from '../application/actor';
import { DomainError } from '../domain/errors';
import { type PermissionCode } from '../../modules/iam/domain/permission';
import { type ResolveActor } from '../../modules/iam/application/use-cases/auth.use-cases';
import { type TokenService } from '../../modules/iam/application/ports/token-service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

/** Reads the actor off the request, failing loudly if a route forgot `authenticate`. */
export function currentActor(req: Request): Actor {
  if (!req.actor) {
    throw DomainError.unauthorized('NOT_AUTHENTICATED', 'Autenticação necessária.');
  }
  return req.actor;
}

export interface AuthMiddlewareDeps {
  tokens: TokenService;
  resolveActor: ResolveActor;
  cookieName: string;
}

/**
 * Establishes the caller's identity and current permissions.
 *
 * The token is read from an HttpOnly cookie first; the Authorization header is
 * accepted as a fallback so the Swagger console and integration tests can drive the
 * API without a browser cookie jar.
 */
export function authenticate(deps: AuthMiddlewareDeps) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractToken(req, deps.cookieName);
      if (!token) {
        throw DomainError.unauthorized('NOT_AUTHENTICATED', 'Autenticação necessária.');
      }
      const claims = deps.tokens.verify(token);
      req.actor = await deps.resolveActor.execute(claims.sub);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Coarse route-level gate. Use cases still assert their own permissions — this only
 * rejects obviously unauthorized traffic early and keeps the route table readable as
 * documentation of what each endpoint requires.
 */
export function requirePermission(...permissions: PermissionCode[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      currentActor(req).requireAll(permissions);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function extractToken(req: Request, cookieName: string): string | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  const fromCookie = cookies?.[cookieName];
  if (fromCookie) {
    return fromCookie;
  }
  const header = req.header('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}
