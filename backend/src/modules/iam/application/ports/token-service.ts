export interface SessionClaims {
  /** The user's public UUID. Internal numeric ids never appear in a token. */
  sub: string;
}

/**
 * Minimal claims by design.
 *
 * A JWT is a bearer credential the client holds for hours; anything embedded in it is
 * both readable by the client and frozen at issue time. Permissions therefore stay out
 * of the token and are resolved server-side per request.
 */
export interface TokenService {
  issue(claims: SessionClaims): string;
  verify(token: string): SessionClaims;
}
