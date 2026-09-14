/**
 * Reversible encryption for a secret the system must use but must not store readable.
 *
 * Today that is the assistant's provider API key. Hashing — how integration secrets are
 * kept — is not an option for it: the key has to be presented to the provider on every
 * call, so the system needs the plaintext back.
 */
export interface SecretCipher {
  encrypt(plaintext: string): string;
  /**
   * `null` when the value cannot be read with the current key: tampered with, malformed,
   * or encrypted under a secret the server no longer has.
   */
  decrypt(ciphertext: string): string | null;
}
