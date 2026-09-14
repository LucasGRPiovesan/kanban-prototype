import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEnv, resetEnvCache } from '../../src/config/env';
import { resolveDatabaseUrl } from '../../src/shared/infrastructure/database-url';
import {
  type BlobClient,
  VercelBlobStorage,
  resolvePublicBaseUrl,
} from '../../src/shared/infrastructure/vercel-blob-storage';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----';

describe('resolveDatabaseUrl', () => {
  const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'kanban-db-url-'));

  it('returns the URL untouched without a CA certificate', () => {
    expect(resolveDatabaseUrl('mysql://u:p@h:3306/db', undefined)).toBe('mysql://u:p@h:3306/db');
    expect(resolveDatabaseUrl('mysql://u:p@h:3306/db', '   ')).toBe('mysql://u:p@h:3306/db');
  });

  it('writes the PEM to a file and asks for strict verification against it', () => {
    const dir = tmp();
    const url = resolveDatabaseUrl('mysql://u:p@h:3306/db', PEM, dir);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('sslaccept')).toBe('strict');
    const file = parsed.searchParams.get('sslcert')!;
    expect(path.dirname(file)).toBe(dir);
    expect(readFileSync(file, 'utf8')).toContain('-----BEGIN CERTIFICATE-----');
  });

  it('accepts base64 and escaped newlines, and appends to an existing query string', () => {
    const dir = tmp();
    const fromBase64 = resolveDatabaseUrl(
      'mysql://u:p@h:3306/db?connection_limit=5',
      Buffer.from(PEM).toString('base64'),
      dir,
    );
    expect(fromBase64).toContain('?connection_limit=5&sslcert=');

    const escaped = resolveDatabaseUrl('mysql://u:p@h/db', PEM.replace(/\n/g, '\\n'), dir);
    const file = new URL(escaped).searchParams.get('sslcert')!;
    expect(readFileSync(file, 'utf8').split('\n')[0]).toBe('-----BEGIN CERTIFICATE-----');
  });

  it('leaves an explicit sslcert alone', () => {
    const url = 'mysql://u:p@h/db?sslcert=./ca.pem';
    expect(resolveDatabaseUrl(url, PEM, tmp())).toBe(url);
  });

  it('rejects a value that is not a certificate', () => {
    expect(() => resolveDatabaseUrl('mysql://u:p@h/db', 'bm90IGEgY2VydA==', tmp())).toThrow(/PEM/);
  });
});

describe('VercelBlobStorage', () => {
  function fakeClient() {
    const calls: { put: [string, number, Record<string, unknown>][]; del: string[] } = { put: [], del: [] };
    const client: BlobClient = {
      put: async (pathname, body, options) => {
        calls.put.push([pathname, body.byteLength, options]);
        return { url: `https://abc123xyz.public.blob.vercel-storage.com/${pathname}` };
      },
      del: async (url) => {
        calls.del.push(url);
      },
    };
    return { client, calls };
  }

  it('locates the store from BLOB_STORE_ID (OIDC), with or without the store_ prefix', () => {
    expect(resolvePublicBaseUrl({ storeId: 'store_AbC123xyz' })).toBe('https://abc123xyz.public.blob.vercel-storage.com');
    expect(resolvePublicBaseUrl({ storeId: 'AbC123xyz' })).toBe('https://abc123xyz.public.blob.vercel-storage.com');
  });

  it('falls back to the store id inside a read-write token, and honours an explicit base URL', () => {
    expect(resolvePublicBaseUrl({ readWriteToken: 'vercel_blob_rw_AbC123xyz_secretpart' })).toBe(
      'https://abc123xyz.public.blob.vercel-storage.com',
    );
    expect(resolvePublicBaseUrl({ storeId: 'store_x', publicBaseUrl: 'https://files.example.com' })).toBe(
      'https://files.example.com',
    );
    expect(() => resolvePublicBaseUrl({})).toThrow(/BLOB_STORE_ID/);
  });

  it('never passes a credential to the SDK, so OIDC is not overridden by a static token', async () => {
    const { client, calls } = fakeClient();
    const storage = new VercelBlobStorage(
      { storeId: 'store_AbC123xyz', readWriteToken: 'vercel_blob_rw_AbC123xyz_secretpart' },
      client,
    );

    const stored = await storage.upload({
      storageKey: 'demands/abc/file.png',
      contentType: 'image/png',
      content: Buffer.from('png'),
    });

    expect(stored).toEqual({ storageKey: 'demands/abc/file.png', sizeBytes: 3 });
    const options = calls.put[0]?.[2] ?? {};
    expect(options).toEqual({
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'image/png',
    });
    expect(options).not.toHaveProperty('token');
    expect(storage.resolveUrl('demands/abc/file.png')).toBe(
      'https://abc123xyz.public.blob.vercel-storage.com/demands/abc/file.png',
    );
  });

  it('deletes by URL and refuses unsafe keys', async () => {
    const { client, calls } = fakeClient();
    const storage = new VercelBlobStorage({ publicBaseUrl: 'https://files.example.com/' }, client);
    await storage.delete('demands/abc/file.png');
    expect(calls.del).toEqual(['https://files.example.com/demands/abc/file.png']);

    await expect(storage.delete('../etc/passwd')).rejects.toMatchObject({ code: 'INVALID_STORAGE_KEY' });
    await expect(
      storage.upload({ storageKey: '/abs', contentType: 'text/plain', content: Buffer.from('x') }),
    ).rejects.toMatchObject({ code: 'INVALID_STORAGE_KEY' });
  });
});

describe('env validation for deployment', () => {
  const base = {
    DATABASE_URL: 'mysql://u:p@h/db',
    JWT_SECRET: 'x'.repeat(40),
  };
  const load = (extra: Record<string, string>) => {
    resetEnvCache();
    try {
      return loadEnv({ ...base, ...extra } as NodeJS.ProcessEnv);
    } finally {
      resetEnvCache();
    }
  };
  const onVercel = { VERCEL: '1', NODE_ENV: 'production', STORAGE_DRIVER: 'vercel-blob', BLOB_STORE_ID: 'store_abc' };

  it('keeps the previous defaults for a plain local configuration', () => {
    const env = load({});
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(env.AUTH_COOKIE_SAMESITE).toBe('lax');
    expect(env.authCookieSecure).toBe(false);
    expect(env.API_DOCS_ENABLED).toBe(true);
    expect(env.TRUST_PROXY).toBe(1);
    expect(env.UPLOAD_MAX_FILE_SIZE_MB).toBe(10);
    expect(env.NOTIFICATION_STREAM_MAX_SECONDS).toBe(1800);
  });

  it('defaults to a secure cookie in production and lets it be overridden', () => {
    expect(load({ NODE_ENV: 'production' }).authCookieSecure).toBe(true);
    expect(load({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' }).authCookieSecure).toBe(false);
    expect(load({ API_DOCS_ENABLED: 'false' }).API_DOCS_ENABLED).toBe(false);
  });

  it('treats a blank variable as absent', () => {
    expect(load({ AUTH_COOKIE_SAMESITE: '', API_DOCS_ENABLED: '' }).AUTH_COOKIE_SAMESITE).toBe('lax');
  });

  it('accepts the Vercel OIDC setup (BLOB_STORE_ID only) and applies platform-safe defaults', () => {
    const env = load(onVercel);
    expect(env.STORAGE_DRIVER).toBe('vercel-blob');
    expect(env.UPLOAD_MAX_FILE_SIZE_MB).toBe(4);
    expect(env.NOTIFICATION_STREAM_MAX_SECONDS).toBe(240);
    expect(env.NOTIFICATION_POLL_INTERVAL_SECONDS).toBe(5);
  });

  it('requires a way to reach the store with the vercel-blob driver', () => {
    expect(() => load({ STORAGE_DRIVER: 'vercel-blob' })).toThrow(/BLOB_STORE_ID/);
    // Outside Vercel a store id alone cannot authenticate…
    expect(() => load({ STORAGE_DRIVER: 'vercel-blob', BLOB_STORE_ID: 'store_abc' })).toThrow(/vercel env pull/);
    // …unless the OIDC token was pulled locally, or a read-write token is used.
    expect(load({ STORAGE_DRIVER: 'vercel-blob', BLOB_STORE_ID: 'store_abc', VERCEL_OIDC_TOKEN: 'jwt' }).STORAGE_DRIVER).toBe(
      'vercel-blob',
    );
    expect(load({ STORAGE_DRIVER: 'vercel-blob', BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_a_b' }).STORAGE_DRIVER).toBe(
      'vercel-blob',
    );
  });

  it('refuses configurations that break on Vercel', () => {
    expect(() => load({ ...onVercel, STORAGE_DRIVER: 'local' })).toThrow(/STORAGE_DRIVER/);
    expect(() => load({ ...onVercel, UPLOAD_MAX_FILE_SIZE_MB: '10' })).toThrow(/4,5 MB/);
    expect(() => load({ ...onVercel, NOTIFICATION_STREAM_MAX_SECONDS: '0' })).toThrow(/300 s/);
    expect(() => load({ ...onVercel, NOTIFICATION_STREAM_MAX_SECONDS: '300' })).toThrow(/300 s/);
  });

  it('refuses SameSite=None without Secure, which browsers would silently drop', () => {
    expect(() => load({ AUTH_COOKIE_SAMESITE: 'none' })).toThrow(/AUTH_COOKIE_SECURE/);
    expect(load({ AUTH_COOKIE_SAMESITE: 'none', AUTH_COOKIE_SECURE: 'true' }).AUTH_COOKIE_SAMESITE).toBe('none');
  });
});
