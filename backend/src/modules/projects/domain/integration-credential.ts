import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DomainError } from '../../../shared/domain/errors';
import { Uuid } from '../../../shared/domain/identifier';

const API_KEY_PREFIX = 'csp_key_';
const API_SECRET_PREFIX = 'csp_secret_';
const SECRET_BYTES = 32;
const SCRYPT_KEY_LENGTH = 64;
const PREVIEW_LENGTH = 4;

/**
 * Machine credential for the demand-integration API, one active pair per project.
 *
 * Modeled the way a password would be, because it plays the same role: `secretHash`
 * is a salted scrypt digest, never the secret itself, and `verifySecret` is the only
 * operation that touches it. The API key is not secret — it is the public half, safe
 * to display, log or paste into a support ticket — but the secret is shown to its
 * owner exactly once, at the moment it is generated, the same convention GitHub
 * personal access tokens and AWS secret keys use.
 *
 * Regenerating replaces the identity of this credential (`uuid`, `apiKey` and secret
 * together), not just the secret in place. That single decision is what lets rotation
 * invalidate every previously issued access token without a revocation list: a token
 * carries the credential's `uuid`, and a rotated credential simply has a different one.
 */
export interface ProjectIntegrationCredentialProps {
  uuid: Uuid;
  projectUuid: Uuid;
  apiKey: string;
  secretHash: string;
  secretPreview: string;
  createdByUserUuid: Uuid;
  createdAt: Date;
  rotatedAt: Date | null;
}

export class ProjectIntegrationCredential {
  private constructor(private readonly props: ProjectIntegrationCredentialProps) {}

  /** A fresh key + secret pair. The plain secret is returned once and never stored. */
  static generate(input: {
    projectUuid: Uuid;
    createdByUserUuid: Uuid;
  }): { credential: ProjectIntegrationCredential; plainSecret: string } {
    const plainSecret = `${API_SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`;
    const credential = new ProjectIntegrationCredential({
      uuid: Uuid.generate(),
      projectUuid: input.projectUuid,
      apiKey: `${API_KEY_PREFIX}${randomBytes(20).toString('hex')}`,
      secretHash: hashSecret(plainSecret),
      secretPreview: plainSecret.slice(-PREVIEW_LENGTH),
      createdByUserUuid: input.createdByUserUuid,
      createdAt: new Date(),
      rotatedAt: null,
    });
    return { credential, plainSecret };
  }

  static rehydrate(props: ProjectIntegrationCredentialProps): ProjectIntegrationCredential {
    return new ProjectIntegrationCredential(props);
  }

  get uuid(): Uuid {
    return this.props.uuid;
  }
  get projectUuid(): Uuid {
    return this.props.projectUuid;
  }
  get apiKey(): string {
    return this.props.apiKey;
  }
  get secretHash(): string {
    return this.props.secretHash;
  }
  get secretPreview(): string {
    return this.props.secretPreview;
  }
  get createdByUserUuid(): Uuid {
    return this.props.createdByUserUuid;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get rotatedAt(): Date | null {
    return this.props.rotatedAt;
  }

  /** Constant-time by construction: `timingSafeEqual` never short-circuits on content. */
  verifySecret(candidate: string): boolean {
    const [salt, digestHex] = this.props.secretHash.split(':');
    if (!salt || !digestHex) {
      return false;
    }
    const digest = Buffer.from(digestHex, 'hex');
    const candidateDigest = scryptSync(candidate, salt, SCRYPT_KEY_LENGTH);
    // Buffers of different lengths would throw inside timingSafeEqual before it can
    // compare anything — checking length first keeps the failure path uniform.
    return digest.length === candidateDigest.length && timingSafeEqual(digest, candidateDigest);
  }
}

function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(secret, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return `${salt}:${digest}`;
}

export function assertApiKeyShape(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith(API_KEY_PREFIX)) {
    throw DomainError.unauthorized(
      'INTEGRATION_INVALID_CREDENTIALS',
      'Credenciais de integração inválidas.',
    );
  }
  return trimmed;
}
