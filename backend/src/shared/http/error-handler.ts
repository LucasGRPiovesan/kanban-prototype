import { type NextFunction, type Request, type Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import {
  type LogSubject,
  type SystemLogger,
  logActorOf,
} from '../application/activity-log.port';
import { type LogSubjectType, type SystemEventCode } from '../domain/activity-catalog';
import { DomainError, type DomainErrorKind, isDomainError } from '../domain/errors';
import { requestContext } from '../infrastructure/request-context';
import { type ApiErrorBody } from './response';

const STATUS_BY_KIND: Record<DomainErrorKind, number> = {
  VALIDATION: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  INVARIANT: 409,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
};

/** Seconds a client should wait, when the error knows — sent as the standard header too. */
function retryAfterOf(error: DomainError): number | null {
  const details = error.details as { retryAfterSeconds?: unknown } | undefined;
  return typeof details?.retryAfterSeconds === 'number' ? details.retryAfterSeconds : null;
}

/**
 * Which failures become persisted system events, and why the rest do not.
 *
 * - FORBIDDEN from an authenticated actor: a permission denied or a business rule
 *   refused. Someone tried something the system would not allow — worth knowing, and
 *   bounded, because only signed-in users can produce it.
 * - INVARIANT: should never happen; always a bug.
 * - Anything unhandled (500): always a bug.
 *
 * Not persisted: VALIDATION, NOT_FOUND and CONFLICT (ordinary, user-correctable input),
 * and every 401. The SPA asks `/auth/me` on every anonymous page load, so a stored 401
 * would mean an unauthenticated visitor can make the server write to its database at
 * will. Those responses stay in the stdout access log, correlated by request id.
 */
function persistedEvent(error: DomainError, authenticated: boolean): SystemEventCode | null {
  if (error.kind === 'INVARIANT') {
    return 'domain.invariant_violated';
  }
  if (error.kind === 'FORBIDDEN' && authenticated) {
    return error.code === 'PERMISSION_DENIED' ? 'security.permission_denied' : 'domain.rule_rejected';
  }
  return null;
}

const SUBJECT_ROUTES: readonly [RegExp, LogSubjectType][] = [
  [/^\/api\/v1\/demands\/([0-9a-f-]{36})/i, 'DEMAND'],
  [/^\/api\/v1\/projects\/([0-9a-f-]{36})/i, 'PROJECT'],
  [/^\/api\/v1\/users\/([0-9a-f-]{36})/i, 'USER'],
  [/^\/api\/v1\/roles\/([0-9a-f-]{36})/i, 'ROLE'],
];

/**
 * The resource a failed request was aimed at, read from the URL.
 *
 * `req.params` cannot be used here: Express restores it when the error leaves the router,
 * so an app-level handler always sees it empty. The original URL is the one place the
 * target survives. This is what lets a refused move appear in that demand's history.
 */
function subjectOf(req: Request): LogSubject | null {
  const pathname = req.originalUrl.split('?')[0] ?? '';
  for (const [pattern, type] of SUBJECT_ROUTES) {
    const match = pattern.exec(pathname);
    if (match?.[1]) {
      return { type, uuid: match[1].toLowerCase(), label: null };
    }
  }
  return null;
}

function httpMetadata(req: Request, status: number) {
  // Path without the query string: a search term is not something to keep.
  return { method: req.method, path: req.originalUrl.split('?')[0], status };
}

/**
 * The single place where errors become HTTP.
 *
 * Use cases and entities throw meaningful domain errors and stay unaware of status
 * codes; this handler owns the whole translation, which is also what keeps error
 * responses shaped consistently across every endpoint. It is also where refused and
 * failed requests are turned into system events — after the response is decided, and
 * without ever letting a logging problem change it.
 */
export function createErrorHandler(systemLogger: SystemLogger) {
  return function errorHandler(
    error: unknown,
    req: Request,
    res: Response,
    // Express only treats a 4-arity function as an error handler.
    _next: NextFunction,
  ): void {
    const requestId = req.requestId ?? 'unknown';

    if (error instanceof ZodError) {
      respond(res, 422, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos.',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
          requestId,
        },
      });
      return;
    }

    if (isDomainError(error)) {
      const status = STATUS_BY_KIND[error.kind];
      const retryAfter = retryAfterOf(error);
      if (retryAfter !== null) {
        res.setHeader('Retry-After', String(retryAfter));
      }
      const event = persistedEvent(error, Boolean(req.actor));
      if (event) {
        systemLogger.log({
          code: event,
          message: error.message,
          actor: req.actor ? logActorOf(req.actor) : null,
          subject: subjectOf(req),
          requestId,
          metadata: { http: httpMetadata(req, status), error: { code: error.code } },
        });
      }
      respond(res, status, {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId,
        },
      });
      return;
    }

    if (error instanceof MulterError) {
      respond(res, 422, {
        error: {
          code: uploadCode(error),
          message: uploadMessage(error),
          requestId,
        },
      });
      return;
    }

    if (error instanceof SyntaxError && 'body' in error) {
      respond(res, 400, {
        error: { code: 'MALFORMED_JSON', message: 'Corpo da requisição inválido.', requestId },
      });
      return;
    }

    // Anything reaching this point is unexpected. The real cause is kept for operators —
    // on stdout and as an ERROR system event only administrators can read — but never
    // leaked in the response: messages and stacks can carry table names or file paths.
    // eslint-disable-next-line no-console
    console.error(`[${requestId}] Unhandled error:`, error);
    systemLogger.log({
      code: 'http.unhandled_error',
      message: 'Erro interno não tratado.',
      actor: req.actor ? logActorOf(req.actor) : null,
      subject: subjectOf(req),
      requestId,
      metadata: {
        http: httpMetadata(req, 500),
        error: {
          name: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
        },
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
    respond(res, 500, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erro interno do servidor.',
        requestId,
      },
    });
  };
}

/** 404 for unmatched routes, in the same envelope as every other error. */
export function notFoundHandler(req: Request, res: Response): void {
  respond(res, 404, {
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
      requestId: req.requestId ?? 'unknown',
    },
  });
}

function respond(res: Response, status: number, body: ApiErrorBody): void {
  res.status(status).json(body);
}

function uploadCode(error: MulterError): string {
  return error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : `UPLOAD_${error.code}`;
}

function uploadMessage(error: MulterError): string {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return 'Arquivo excede o tamanho máximo permitido.';
    case 'LIMIT_FILE_COUNT':
      return 'Número de arquivos acima do permitido.';
    default:
      return 'Falha no envio do arquivo.';
  }
}

/**
 * Wraps an async handler so rejected promises reach the error handler — and opens the
 * request-context scope that activity entries read their request id from.
 *
 * The scope is opened here rather than in the request-id middleware because body parsers
 * and multer resume in stream callbacks that do not inherit a scope opened before them.
 * By the time a route handler runs, all of that has finished.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requestContext
      .run({ requestId: req.requestId }, () => handler(req, res, next))
      .catch(next);
  };
}

export { DomainError };
