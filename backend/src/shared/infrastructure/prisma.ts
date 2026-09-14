import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from './database-url';

let client: PrismaClient | null = null;

/**
 * One client per process. On a serverless platform the module stays loaded across
 * invocations of a warm instance, so this also keeps a single connection pool per
 * instance instead of opening a new one on every request.
 */
export function prismaClient(): PrismaClient {
  if (!client) {
    const databaseUrl = process.env.DATABASE_URL;
    client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      ...(databaseUrl
        ? { datasourceUrl: resolveDatabaseUrl(databaseUrl, process.env.DATABASE_CA_CERT) }
        : {}),
    });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
