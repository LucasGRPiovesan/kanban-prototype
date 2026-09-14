import { type Actor } from '../../../../shared/application/actor';
import { type ActivityRecorder, logActorOf } from '../../../../shared/application/activity-log.port';
import { type UnitOfWork } from '../../../../shared/application/unit-of-work.port';
import { DomainError } from '../../../../shared/domain/errors';
import { Uuid } from '../../../../shared/domain/identifier';
import {
  ProjectIntegrationCredential,
  assertApiKeyShape,
} from '../../domain/integration-credential';
import {
  type IntegrationCredentialRepository,
  type ProjectRepository,
} from '../ports/repositories';
import { type IntegrationTokenService } from '../ports/integration-token-service';
import { type ProjectAccessResolver } from './project.use-cases';

export interface IntegrationStatusDTO {
  configured: boolean;
  apiKey: string | null;
  secretPreview: string | null;
  createdAt: string | null;
  rotatedAt: string | null;
}

export interface GeneratedCredentialDTO extends IntegrationStatusDTO {
  /** Present only in the response to the generating call — never returned again. */
  apiSecret: string;
}

export interface IntegrationAccessTokenDTO {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

function toStatusDTO(credential: ProjectIntegrationCredential | null): IntegrationStatusDTO {
  if (!credential) {
    return { configured: false, apiKey: null, secretPreview: null, createdAt: null, rotatedAt: null };
  }
  return {
    configured: true,
    apiKey: credential.apiKey,
    secretPreview: credential.secretPreview,
    createdAt: credential.createdAt.toISOString(),
    rotatedAt: credential.rotatedAt ? credential.rotatedAt.toISOString() : null,
  };
}

function parseProjectUuid(value: string): Uuid {
  if (!Uuid.isValid(value)) {
    throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
  }
  return Uuid.create(value);
}

/** Shared guard: the three project-side use cases below all start the same way. */
async function requireManageableProject(
  actor: Actor,
  projectUuid: string,
  projects: ProjectRepository,
  access: ProjectAccessResolver,
) {
  actor.require('PROJECT_MANAGE_INTEGRATION');
  const uuid = parseProjectUuid(projectUuid);
  const policy = await access.forActor(actor);
  policy.assertAccess(actor, uuid);
  const project = await projects.findByUuid(uuid);
  if (!project) {
    throw DomainError.notFound('PROJECT_NOT_FOUND', 'Projeto não encontrado.');
  }
  return { uuid, project };
}

export class GetIntegrationStatus {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly access: ProjectAccessResolver,
    private readonly credentials: IntegrationCredentialRepository,
  ) {}

  async execute(actor: Actor, projectUuid: string): Promise<IntegrationStatusDTO> {
    const { uuid } = await requireManageableProject(actor, projectUuid, this.projects, this.access);
    return toStatusDTO(await this.credentials.findByProjectUuid(uuid));
  }
}

/**
 * Generates a fresh key/secret pair, replacing whichever one the project had.
 *
 * "Regenerate" rather than "rotate the secret in place" on purpose: a single action a
 * project owner reaches for either the first time they configure the integration or
 * when they suspect the current pair leaked, and in both cases they want a clean pair
 * with nothing of the old one still valid — matching how GitHub tokens and AWS access
 * keys are regenerated.
 */
export class GenerateIntegrationCredential {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly access: ProjectAccessResolver,
    private readonly credentials: IntegrationCredentialRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(actor: Actor, projectUuid: string): Promise<GeneratedCredentialDTO> {
    const { uuid, project } = await requireManageableProject(
      actor,
      projectUuid,
      this.projects,
      this.access,
    );

    const { credential, plainSecret } = ProjectIntegrationCredential.generate({
      projectUuid: uuid,
      createdByUserUuid: actor.userUuid,
    });

    const saved = await this.uow.run(async () => {
      const persisted = await this.credentials.save(credential);
      await this.activity.record(logActorOf(actor), {
        action: 'project.integration_credential_generated',
        subject: { type: 'PROJECT', uuid: project.uuid.toString(), label: project.name },
        project: { uuid: project.uuid.toString(), name: project.name },
        // The secret never touches a log row, even in a hash — only the public key.
        metadata: { apiKey: persisted.apiKey },
      });
      return persisted;
    });

    return { ...toStatusDTO(saved), apiSecret: plainSecret };
  }
}

export class RevokeIntegrationCredential {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly access: ProjectAccessResolver,
    private readonly credentials: IntegrationCredentialRepository,
    private readonly uow: UnitOfWork,
    private readonly activity: ActivityRecorder,
  ) {}

  async execute(actor: Actor, projectUuid: string): Promise<void> {
    const { uuid, project } = await requireManageableProject(
      actor,
      projectUuid,
      this.projects,
      this.access,
    );

    const existing = await this.credentials.findByProjectUuid(uuid);
    if (!existing) {
      // Nothing configured is already the desired end state, not an error.
      return;
    }

    await this.uow.run(async () => {
      await this.credentials.deleteByProjectUuid(uuid);
      await this.activity.record(logActorOf(actor), {
        action: 'project.integration_credential_revoked',
        subject: { type: 'PROJECT', uuid: project.uuid.toString(), label: project.name },
        project: { uuid: project.uuid.toString(), name: project.name },
        metadata: { apiKey: existing.apiKey },
      });
    });
  }
}

/**
 * The public token-exchange endpoint: no session, no Actor — the api key/secret pair
 * *is* the credential being authenticated, the same shape as an OAuth2 client
 * credentials grant. A wrong key or a wrong secret produce the identical error, so a
 * caller probing for which one is wrong learns nothing either way.
 */
export class IssueIntegrationAccessToken {
  constructor(
    private readonly credentials: IntegrationCredentialRepository,
    private readonly tokens: IntegrationTokenService,
  ) {}

  async execute(input: { apiKey: string; apiSecret: string }): Promise<IntegrationAccessTokenDTO> {
    const apiKey = assertApiKeyShape(input.apiKey);
    const credential = await this.credentials.findByApiKey(apiKey);
    if (!credential || !credential.verifySecret(input.apiSecret)) {
      throw DomainError.unauthorized(
        'INTEGRATION_INVALID_CREDENTIALS',
        'API key ou secret inválidos.',
      );
    }
    const issued = this.tokens.issue({
      projectUuid: credential.projectUuid.toString(),
      credentialUuid: credential.uuid.toString(),
    });
    return { accessToken: issued.token, tokenType: 'Bearer', expiresIn: issued.expiresInSeconds };
  }
}

/**
 * Authenticates one demand-integration request end to end.
 *
 * Verifying the token's signature is not enough on its own: it proves the token was
 * issued by this server, not that the credential behind it is still the project's
 * *current* one. Re-reading that credential on every call — the same "resolve from the
 * database each request" rule the user session already follows, see
 * `docs/ARCHITECTURE.md` — is what makes rotating or revoking a credential take effect
 * immediately, instead of only once every outstanding token happens to expire.
 */
export class AuthenticateIntegrationRequest {
  constructor(
    private readonly credentials: IntegrationCredentialRepository,
    private readonly tokens: IntegrationTokenService,
  ) {}

  async execute(
    bearerToken: string,
  ): Promise<{ projectUuid: Uuid; credentialUuid: string; apiKeyPreview: string }> {
    const claims = this.tokens.verify(bearerToken);
    const projectUuid = Uuid.create(claims.projectUuid);
    const credential = await this.credentials.findByProjectUuid(projectUuid);
    if (!credential || credential.uuid.toString() !== claims.credentialUuid) {
      throw DomainError.unauthorized(
        'INTEGRATION_TOKEN_INVALID',
        'Token de integração expirado, revogado ou substituído por uma nova credencial.',
      );
    }
    return {
      projectUuid,
      credentialUuid: credential.uuid.toString(),
      apiKeyPreview: maskApiKey(credential.apiKey),
    };
  }
}

/** `csp_key_ab12***y9z0` — enough to recognize the credential in a log line. */
function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 12) {
    return apiKey;
  }
  return `${apiKey.slice(0, 12)}***${apiKey.slice(-4)}`;
}
