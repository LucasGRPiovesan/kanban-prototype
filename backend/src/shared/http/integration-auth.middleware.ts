import { type NextFunction, type Request, type Response } from 'express';
import { type AuthenticateIntegrationRequest } from '../../modules/projects/application/use-cases/integration.use-cases';
import { type Uuid } from '../domain/identifier';
import { DomainError } from '../domain/errors';

export interface IntegrationRequestContext {
  projectUuid: Uuid;
  credentialUuid: string;
  apiKeyPreview: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      integration?: IntegrationRequestContext;
    }
  }
}

/** Reads the verified integration context, failing loudly if a route forgot the gate. */
export function currentIntegration(req: Request): IntegrationRequestContext {
  if (!req.integration) {
    throw DomainError.unauthorized('NOT_AUTHENTICATED', 'Autenticação de integração necessária.');
  }
  return req.integration;
}

/**
 * Gate for the demand-integration API — the counterpart of `authenticate()` for user
 * sessions, deliberately kept as a separate function so the two credentials can never
 * be confused: this only accepts an integration access token (see
 * `JwtIntegrationTokenService`), never the session cookie or its bearer fallback.
 */
export function integrationAuth(deps: { authenticate: AuthenticateIntegrationRequest }) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.header('authorization');
      if (!header?.toLowerCase().startsWith('bearer ')) {
        throw DomainError.unauthorized(
          'NOT_AUTHENTICATED',
          'Envie o token de integração em Authorization: Bearer <token>.',
        );
      }
      req.integration = await deps.authenticate.execute(header.slice(7).trim());
      next();
    } catch (error) {
      next(error);
    }
  };
}
