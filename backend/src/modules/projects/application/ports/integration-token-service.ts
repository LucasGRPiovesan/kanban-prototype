export interface IntegrationTokenClaims {
  projectUuid: string;
  credentialUuid: string;
}

export interface IssuedIntegrationToken {
  token: string;
  expiresInSeconds: number;
}

/**
 * Signs and verifies the short-lived access token a project's integration exchanges
 * its `apiKey`/`apiSecret` for.
 *
 * Kept as its own port, distinct from the user session's `TokenService`, on purpose:
 * the two credentials must never be interchangeable. A stolen session cookie must not
 * unlock the demand-integration API, and a leaked integration token must not open the
 * application UI. `credentialUuid` is the field that makes revocation immediate —
 * `AuthenticateIntegrationRequest` re-reads the project's current credential on every
 * call and rejects a token whose `credentialUuid` no longer matches it.
 */
export interface IntegrationTokenService {
  issue(claims: IntegrationTokenClaims): IssuedIntegrationToken;
  verify(token: string): IntegrationTokenClaims;
}
