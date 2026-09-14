import { loadEnv } from '../config/env';
import { disconnectPrisma, prismaClient } from '../shared/infrastructure/prisma';
import { buildDependencies } from './composition-root';
import { createApp } from './app';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const prisma = prismaClient();

  // Fail fast: a server that accepts traffic without a reachable database only
  // produces confusing 500s.
  await prisma.$connect();

  const deps = buildDependencies(env, prisma);
  const app = createApp(env, deps);

  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API em http://localhost:${env.PORT} (${env.NODE_ENV})`);
    // eslint-disable-next-line no-console
    console.log(`Swagger em http://localhost:${env.PORT}/docs`);

    // Each boot leaves a mark: a restart that nobody asked for shows up in the system
    // log next to whatever error preceded it.
    deps.systemLogger.log({
      code: 'app.started',
      message: `Aplicação iniciada em ${env.NODE_ENV} na porta ${env.PORT}.`,
      metadata: { environment: env.NODE_ENV, port: env.PORT, node: process.version },
    });
  });

  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} recebido, encerrando...`);
    // Open notification streams never finish on their own; end them so close() can.
    deps.notifications.hub.disconnectAll();
    server.close(() => {
      // System events are written without being awaited; give the in-flight ones the
      // chance to land before the connection pool goes away.
      void deps.systemLogger
        .drain()
        .then(() => disconnectPrisma())
        .finally(() => process.exit(0));
    });
    // Don't let a hung connection block the container indefinitely.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Falha ao iniciar a aplicação:', error);
  process.exit(1);
});
