import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { type SecretCipher } from '../application/secret-cipher.port';

const VERSION = 'v1';
const IV_BYTES = 12;

/**
 * AES-256-GCM with a key derived from the server's master secret.
 *
 * GCM authenticates as well as encrypts, so a ciphertext edited in the database fails to
 * decrypt instead of decrypting to garbage. The key is derived with HKDF and a `purpose`
 * label rather than used raw: the same master secret signs session tokens, and one
 * secret must never serve two algorithms with the same bytes.
 *
 * Format: `v1:<iv>:<tag>:<ciphertext>`, base64url. The version prefix is what allows a
 * future key rotation to read old values while writing new ones.
 */
export class AesGcmSecretCipher implements SecretCipher {
  private readonly key: Buffer;

  constructor(masterSecret: string, purpose: string) {
    this.key = Buffer.from(hkdfSync('sha256', masterSecret, 'kanban-secret-cipher', purpose, 32));
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv, tag, body].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join(':');
  }

  decrypt(ciphertext: string): string | null {
    const [version, iv, tag, body, ...rest] = ciphertext.split(':');
    if (version !== VERSION || !iv || !tag || body === undefined || rest.length > 0) {
      return null;
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(body, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }
}

/** HKDF label of the assistant key — shared by the server and the seed that writes it. */
export const ASSISTANT_KEY_PURPOSE = 'assistant-provider-api-key';
