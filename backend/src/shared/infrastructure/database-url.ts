import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The connection URL Prisma should use, with verified TLS when a CA certificate is given.
 *
 * Managed MySQL services such as Aiven require TLS and sign the server certificate with a
 * per-project CA. Prisma only accepts that CA as a *file path* in the URL (`sslcert`),
 * while serverless platforms only offer environment variables — so the certificate is
 * provided as `DATABASE_CA_CERT` (PEM text or its base64), written once to the temp
 * directory, and referenced from there with `sslaccept=strict`.
 *
 * Used by the runtime client, the seed and the migration wrapper alike, so all three
 * connect the same way. A URL that already carries `sslcert` is left untouched: an
 * explicit configuration always wins.
 */
export function resolveDatabaseUrl(
  databaseUrl: string,
  caCert: string | undefined,
  tempDir: string = os.tmpdir(),
): string {
  const pem = caCert?.trim() ? decodeCertificate(caCert.trim()) : null;
  if (!pem || /[?&]sslcert=/.test(databaseUrl)) {
    return databaseUrl;
  }

  // Content-addressed name: concurrent cold starts write identical bytes to the same file,
  // and a rotated certificate lands in a new file instead of racing the old one.
  const digest = createHash('sha256').update(pem).digest('hex').slice(0, 16);
  const file = path.join(tempDir, `kanban-db-ca-${digest}.pem`);
  if (!existsSync(file)) {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(file, pem, { mode: 0o600 });
  }

  const separator = databaseUrl.includes('?') ? '&' : '?';
  const params = new URLSearchParams({ sslcert: file, sslaccept: 'strict' });
  return `${databaseUrl}${separator}${params.toString()}`;
}

function decodeCertificate(value: string): string {
  if (value.includes('-----BEGIN')) {
    // Platforms that cannot store multi-line values often keep the newlines escaped.
    return `${value.replace(/\\n/g, '\n')}\n`;
  }
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  if (!decoded.includes('-----BEGIN')) {
    throw new Error('DATABASE_CA_CERT deve conter um certificado PEM (texto ou base64).');
  }
  return decoded.endsWith('\n') ? decoded : `${decoded}\n`;
}
