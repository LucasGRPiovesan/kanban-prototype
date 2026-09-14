import { del, put } from '@vercel/blob';
import { DomainError } from '../domain/errors';
import { type FileStoragePort, type StoredFile, type UploadInput } from '../application/file-storage.port';

/** The two SDK calls this adapter makes — injectable so tests never reach the network. */
export interface BlobClient {
  put(
    pathname: string,
    body: Buffer,
    options: {
      access: 'public';
      contentType: string;
      addRandomSuffix: false;
      allowOverwrite: false;
    },
  ): Promise<{ url: string }>;
  del(url: string): Promise<void>;
}

/**
 * Credentials are deliberately never passed here: the SDK resolves them itself, in the
 * order Vercel documents — OIDC first (the short-lived token Vercel attaches to each
 * function request, paired with `BLOB_STORE_ID`), then `BLOB_READ_WRITE_TOKEN` for code
 * running outside Vercel. Passing a `token` option explicitly would override OIDC.
 */
const SDK: BlobClient = {
  put: (pathname, body, options) => put(pathname, body, options),
  del: (url) => del(url),
};

export interface VercelBlobStorageConfig {
  /** `BLOB_STORE_ID` — added by Vercel when a store is connected (OIDC). An identifier, not a secret. */
  storeId?: string;
  /** `BLOB_READ_WRITE_TOKEN` — only for hosts outside Vercel; used here just to locate the store. */
  readWriteToken?: string;
  /** `BLOB_PUBLIC_BASE_URL` — explicit override of the store's public host. */
  publicBaseUrl?: string;
}

/**
 * Attachments in Vercel Blob — the adapter a serverless deployment needs, where the
 * function's filesystem does not survive between invocations.
 *
 * Same contract and same security posture as LocalFileStorage: the application generates
 * every key (never a filename), keys are validated here again, and objects are public by
 * URL only — the URL carries a random uuid, exactly like `/files/...` on the local driver.
 * The store must therefore be created with **public** access (a store's access mode cannot
 * be changed later).
 *
 * `addRandomSuffix: false` keeps the stored URL a pure function of the key, which is what
 * lets `resolveUrl` stay synchronous and the database keep storing keys rather than URLs
 * (switching drivers later never rewrites a row).
 */
export class VercelBlobStorage implements FileStoragePort {
  private readonly baseUrl: string;

  constructor(config: VercelBlobStorageConfig, private readonly client: BlobClient = SDK) {
    this.baseUrl = resolvePublicBaseUrl(config).replace(/\/+$/, '');
  }

  async upload(input: UploadInput): Promise<StoredFile> {
    assertKey(input.storageKey);
    const result = await this.client.put(input.storageKey, input.content, {
      access: 'public',
      contentType: input.contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    const expected = this.resolveUrl(input.storageKey);
    if (result.url.toLowerCase() !== expected.toLowerCase()) {
      // A misconfigured store id or base URL would silently produce broken links on every
      // card — say so loudly the first time it happens instead.
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          source: 'vercel-blob-storage',
          message: 'URL do Blob diferente da esperada; confira BLOB_STORE_ID / BLOB_PUBLIC_BASE_URL e se o store é público.',
          expected,
          actual: result.url,
        }),
      );
    }
    return { storageKey: input.storageKey, sizeBytes: input.content.byteLength };
  }

  async delete(storageKey: string): Promise<void> {
    assertKey(storageKey);
    await this.client.del(this.resolveUrl(storageKey));
  }

  resolveUrl(storageKey: string): string {
    return `${this.baseUrl}/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
  }
}

/**
 * The store's public host: `https://<store-id>.public.blob.vercel-storage.com` — the same
 * construction the SDK uses. Taken, in order, from the explicit override, `BLOB_STORE_ID`
 * (the OIDC setup) or the store id embedded in a read-write token.
 */
export function resolvePublicBaseUrl(config: VercelBlobStorageConfig): string {
  if (config.publicBaseUrl?.trim()) {
    return config.publicBaseUrl.trim();
  }
  const storeId = config.storeId?.trim()
    ? normalizeStoreId(config.storeId.trim())
    : storeIdFromReadWriteToken(config.readWriteToken);
  if (!storeId) {
    throw new Error(
      'Vercel Blob sem store identificado: defina BLOB_STORE_ID (OIDC), BLOB_READ_WRITE_TOKEN ou BLOB_PUBLIC_BASE_URL.',
    );
  }
  return `https://${storeId.toLowerCase()}.public.blob.vercel-storage.com`;
}

/** The SDK accepts `store_<id>` and `<id>`; the host uses the bare id. */
function normalizeStoreId(storeId: string): string {
  return storeId.startsWith('store_') ? storeId.slice('store_'.length) : storeId;
}

/** `vercel_blob_rw_<storeId>_<secret>` — the same parsing the SDK performs. */
function storeIdFromReadWriteToken(token: string | undefined): string | null {
  return token ? (/^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(token.trim())?.[1] ?? null) : null;
}

function assertKey(storageKey: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(storageKey) || storageKey.includes('..')) {
    throw DomainError.validation('INVALID_STORAGE_KEY', 'Chave de armazenamento inválida.');
  }
}
