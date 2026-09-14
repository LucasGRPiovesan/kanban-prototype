import jwt from 'jsonwebtoken';
import { DomainError } from '../../../shared/domain/errors';
import {
  type IntegrationTokenClaims,
  type IntegrationTokenService,
  type IssuedIntegrationToken,
} from '../application/ports/integration-token-service';

const TOKEN_TYPE = 'integration';

interface IntegrationTokenPayload {
  typ: typeof TOKEN_TYPE;
  pro: string;
  cred: string;
}

export class JwtIntegrationTokenService implements IntegrationTokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
  ) {}

  issue(claims: IntegrationTokenClaims): IssuedIntegrationToken {
    const token = jwt.sign({ typ: TOKEN_TYPE, pro: claims.projectUuid, cred: claims.credentialUuid }, this.secret, {
      expiresIn: this.expiresIn,
      algorithm: 'HS256',
    } as jwt.SignOptions);
    const decoded = jwt.decode(token) as { exp?: number; iat?: number } | null;
    const expiresInSeconds =
      decoded?.exp && decoded.iat ? decoded.exp - decoded.iat : secondsFrom(this.expiresIn);
    return { token, expiresInSeconds };
  }

  verify(token: string): IntegrationTokenClaims {
    try {
      // Pinned algorithm, same reasoning as the session token: blocks "alg: none" and
      // HS/RS confusion. No `sub` claim here on purpose — a session-shaped payload
      // (which always carries one) can never be mistaken for an integration token.
      const payload = jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
      }) as Partial<IntegrationTokenPayload>;
      if (payload.typ !== TOKEN_TYPE || !payload.pro || !payload.cred) {
        throw DomainError.unauthorized(
          'INTEGRATION_TOKEN_INVALID',
          'Token de integração inválido.',
        );
      }
      return { projectUuid: payload.pro, credentialUuid: payload.cred };
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      throw DomainError.unauthorized(
        'INTEGRATION_TOKEN_INVALID',
        'Token de integração expirado ou inválido.',
      );
    }
  }
}

/** Fallback only: `jwt.decode` above always succeeds for a token this class just signed. */
function secondsFrom(expiresIn: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiresIn);
  if (!match) {
    return 3600;
  }
  const amount = Number(match[1]);
  const unit = { s: 1, m: 60, h: 3600, d: 86_400 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return amount * unit;
}
