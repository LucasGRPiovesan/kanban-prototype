import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DomainError } from '../domain/errors';
import { type FileStoragePort, type StoredFile, type UploadInput } from '../application/file-storage.port';

/**
 * Development / self-hosted adapter: files on the local filesystem, served back
 * through a static route.
 *
 * Every key is validated and re-resolved against the root before touching the disk, so
 * a crafted key such as `../../etc/passwd` cannot escape the storage directory.
 */
export class LocalFileStorage implements FileStoragePort {
  constructor(
    private readonly rootDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  async upload(input: UploadInput): Promise<StoredFile> {
    const absolute = this.resolveSafe(input.storageKey);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, input.content);
    return { storageKey: input.storageKey, sizeBytes: input.content.byteLength };
  }

  async delete(storageKey: string): Promise<void> {
    const absolute = this.resolveSafe(storageKey);
    await fs.rm(absolute, { force: true });
  }

  resolveUrl(storageKey: string): string {
    return `${this.publicBaseUrl.replace(/\/+$/, '')}/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
  }

  private resolveSafe(storageKey: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(storageKey) || storageKey.includes('..')) {
      throw DomainError.validation('INVALID_STORAGE_KEY', 'Chave de armazenamento inválida.');
    }
    const root = path.resolve(this.rootDir);
    const absolute = path.resolve(root, storageKey);
    // Defence in depth: even if the pattern above is ever loosened, the resolved path
    // must still sit inside the storage root.
    if (absolute !== root && !absolute.startsWith(root + path.sep)) {
      throw DomainError.validation('INVALID_STORAGE_KEY', 'Chave de armazenamento inválida.');
    }
    return absolute;
  }
}
