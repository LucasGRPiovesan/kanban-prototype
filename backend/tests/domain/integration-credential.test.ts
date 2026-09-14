import { describe, expect, it } from 'vitest';
import {
  ProjectIntegrationCredential,
  assertApiKeyShape,
} from '../../src/modules/projects/domain/integration-credential';
import { Uuid } from '../../src/shared/domain/identifier';
import { type DomainError } from '../../src/shared/domain/errors';

function errorCodeOf(action: () => unknown): string | null {
  try {
    action();
  } catch (error) {
    return (error as DomainError).code;
  }
  return null;
}

describe('ProjectIntegrationCredential', () => {
  const projectUuid = Uuid.generate();
  const createdByUserUuid = Uuid.generate();

  it('generates a key/secret pair the plain secret is only ever seen once', () => {
    const { credential, plainSecret } = ProjectIntegrationCredential.generate({
      projectUuid,
      createdByUserUuid,
    });

    expect(credential.apiKey).toMatch(/^csp_key_[0-9a-f]{40}$/);
    expect(plainSecret).toMatch(/^csp_secret_/);
    // The hash never contains the plaintext, and it is not a bare digest either — it
    // carries its own salt, so two credentials never collide even with the same secret.
    expect(credential.secretHash).not.toContain(plainSecret);
    expect(credential.secretHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(credential.secretPreview).toBe(plainSecret.slice(-4));
    expect(credential.rotatedAt).toBeNull();
  });

  it('verifies the exact secret it was generated with, and nothing else', () => {
    const { credential, plainSecret } = ProjectIntegrationCredential.generate({
      projectUuid,
      createdByUserUuid,
    });

    expect(credential.verifySecret(plainSecret)).toBe(true);
    expect(credential.verifySecret(`${plainSecret}x`)).toBe(false);
    expect(credential.verifySecret('csp_secret_totally-wrong')).toBe(false);
    expect(credential.verifySecret('')).toBe(false);
  });

  it('never repeats a secret or a hash across two generations', () => {
    const first = ProjectIntegrationCredential.generate({ projectUuid, createdByUserUuid });
    const second = ProjectIntegrationCredential.generate({ projectUuid, createdByUserUuid });

    expect(first.plainSecret).not.toBe(second.plainSecret);
    expect(first.credential.apiKey).not.toBe(second.credential.apiKey);
    expect(first.credential.secretHash).not.toBe(second.credential.secretHash);
    expect(first.credential.uuid.equals(second.credential.uuid)).toBe(false);
  });

  it('rehydrates without regenerating anything', () => {
    const { credential } = ProjectIntegrationCredential.generate({ projectUuid, createdByUserUuid });
    const rehydrated = ProjectIntegrationCredential.rehydrate({
      uuid: credential.uuid,
      projectUuid: credential.projectUuid,
      apiKey: credential.apiKey,
      secretHash: credential.secretHash,
      secretPreview: credential.secretPreview,
      createdByUserUuid: credential.createdByUserUuid,
      createdAt: credential.createdAt,
      rotatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(rehydrated.apiKey).toBe(credential.apiKey);
    expect(rehydrated.rotatedAt).toEqual(new Date('2026-01-01T00:00:00Z'));
  });
});

describe('assertApiKeyShape', () => {
  it('accepts a well-formed key and rejects anything else with the same generic error', () => {
    expect(assertApiKeyShape('csp_key_abc123')).toBe('csp_key_abc123');
    expect(errorCodeOf(() => assertApiKeyShape('not-a-key'))).toBe('INTEGRATION_INVALID_CREDENTIALS');
    expect(errorCodeOf(() => assertApiKeyShape(''))).toBe('INTEGRATION_INVALID_CREDENTIALS');
  });
});
