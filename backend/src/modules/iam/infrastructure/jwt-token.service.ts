import jwt from 'jsonwebtoken';
import { DomainError } from '../../../shared/domain/errors';
import { type SessionClaims, type TokenService } from '../application/ports/token-service';

export class JwtTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
  ) {}

  issue(claims: SessionClaims): string {
    return jwt.sign({}, this.secret, {
      subject: claims.sub,
      expiresIn: this.expiresIn,
      algorithm: 'HS256',
    } as jwt.SignOptions);
  }

  verify(token: string): SessionClaims {
    try {
      // Pinning the algorithm blocks the "alg: none" and HS/RS confusion families.
      const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
      const sub = typeof payload === 'string' ? undefined : payload.sub;
      if (typeof sub !== 'string' || sub.length === 0) {
        throw DomainError.unauthorized('INVALID_SESSION', 'Sessão inválida.');
      }
      return { sub };
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      throw DomainError.unauthorized('INVALID_SESSION', 'Sessão expirada ou inválida.');
    }
  }
}
