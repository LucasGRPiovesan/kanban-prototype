import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { type AppEnv } from '../config/env';
import { authenticate } from '../shared/http/auth.middleware';
import { integrationAuth } from '../shared/http/integration-auth.middleware';
import { originGuard } from '../shared/http/origin-guard.middleware';
import { bodyField, rateLimitByIp } from '../shared/http/rate-limit.middleware';
import { createErrorHandler, notFoundHandler } from '../shared/http/error-handler';
import { requestIdMiddleware } from '../shared/http/request-id';
import { ok } from '../shared/http/response';
import {
  createAuthRouter,
  createRolesRouter,
  createSessionRouter,
  createUsersRouter,
} from '../modules/iam/presentation/iam.routes';
import { createProjectsRouter } from '../modules/projects/presentation/projects.routes';
import {
  createDemandsRouter,
  createProjectDemandsRouter,
} from '../modules/demands/presentation/demands.routes';
import { createLogsRouter } from '../modules/logs/presentation/logs.routes';
import { createDashboardRouter } from '../modules/dashboard/presentation/dashboard.routes';
import { createAssistantRouter } from '../modules/assistant/presentation/assistant.routes';
import {
  createBrandingManagementRouter,
  createPublicBrandingRouter,
} from '../modules/branding/presentation/branding.routes';
import { createIntegrationAuthRouter } from '../modules/projects/presentation/integration-auth.routes';
import { createIntegrationDemandsRouter } from '../modules/demands/presentation/integration-demands.routes';
import {
  createDemandWatchRouter,
  createNotificationsRouter,
} from '../modules/notifications/presentation/notifications.routes';
import { type AppDependencies } from './composition-root';
import { openApiDocument } from './openapi';

const SWAGGER_UI_VERSION = '5.18.2';
const SWAGGER_CDN_PAGE = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Kanban API</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js"></script>
    <script>window.ui = SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui' });</script>
  </body>
</html>`;

export function createApp(env: AppEnv, deps: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      // Uploaded files are served from this origin and embedded by the SPA on another
      // one; the default same-origin policy would block every card thumbnail.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
      // Helmet's default `X-Frame-Options: SAMEORIGIN` blocks framing from any other
      // origin — invisible for an <img> thumbnail, but it is exactly what makes the
      // attachment viewer's <iframe> refuse a PDF with "won't allow ... to display the
      // page if another site has embedded it". Turning it off is safe specifically
      // because this origin never renders an interactive page of its own to protect:
      // it serves JSON and user-uploaded files, neither clickjackable.
      xFrameOptions: false,
    }),
  );

  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true, // required for the HttpOnly session cookie
    }),
  );

  // Correlation id must exist before the access log so every line can carry it.
  app.use(requestIdMiddleware);

  morgan.token('requestId', (req) => (req as express.Request).requestId ?? '-');
  app.use(
    morgan(
      env.isProduction
        ? ':requestId :method :url :status :response-time ms - :res[content-length]'
        : ':requestId :method :url :status :response-time ms',
      {
        // Never log the token itself: Morgan's `combined` format would include headers.
        skip: () => env.isTest,
      },
    ),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Static delivery for the local storage driver. An S3 adapter would serve these
  // directly and this mount would simply not exist.
  if (deps.storageLocalDir) {
    app.use(
      '/files',
      express.static(deps.storageLocalDir, {
        index: false,
        dotfiles: 'deny',
        maxAge: '7d',
      }),
    );
  }

  app.get('/health', (_req, res) => ok(res, { status: 'ok', uptime: process.uptime() }));

  const api = express.Router();

  // Every API response is per-user data: no browser, proxy or CDN may keep a copy. This
  // matters most behind a CDN rewrite (Vercel honours upstream caching headers), where a
  // cached authenticated response could be served to the next person asking the same URL.
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // CSRF: state-changing browser requests must come from an allowed origin. Mounted ahead
  // of every cookie-authenticated router; the bearer-token integration API is exempt below.
  const csrf = originGuard(env.corsOrigins);

  // Public endpoints get a per-IP throttle — see rateLimitByIp for the reasoning.
  api.post(
    '/auth/login',
    rateLimitByIp(
      deps.publicRateLimiters.login,
      'login',
      'Muitas tentativas de entrada. Aguarde um instante.',
      bodyField('userUuid'),
    ),
  );
  api.post(
    '/integration/auth/token',
    rateLimitByIp(
      deps.publicRateLimiters.integrationToken,
      'integration-token',
      'Muitas solicitações de token. Aguarde um instante.',
      bodyField('apiKey'),
    ),
  );

  api.use('/auth', csrf, createAuthRouter(deps.iam));

  /*
   * The demand-integration API: a separate credential from the start, never behind the
   * user-session `authenticate()` below. The token endpoint is public by necessity — it
   * is the exchange that produces the credential everything else here requires — and
   * the demand endpoints sit behind `integrationAuth`, the bearer-token counterpart of
   * `authenticate` that only accepts a project's integration token. See
   * `docs/ADDED_REQUIREMENTS.md` for the full shape of this API.
   */
  // Public: the login page shows the configured logo before anyone is signed in.
  api.use('/branding', createPublicBrandingRouter(deps.branding.public));

  api.use('/integration', createIntegrationAuthRouter(deps.integration.auth));
  const integrationApi = express.Router();
  integrationApi.use(integrationAuth({ authenticate: deps.integration.authenticate }));
  integrationApi.use(createIntegrationDemandsRouter(deps.integration.demands));
  api.use('/integration', integrationApi);

  const authenticated = express.Router();
  authenticated.use(csrf);
  authenticated.use(
    authenticate({
      tokens: deps.tokens,
      resolveActor: deps.resolveActor,
      cookieName: deps.cookieName,
    }),
  );

  authenticated.use('/auth', createSessionRouter(deps.iam));
  authenticated.use('/users', createUsersRouter(deps.iam));
  authenticated.use('/roles', createRolesRouter(deps.iam));
  authenticated.use('/projects', createProjectsRouter(deps.projects));
  authenticated.use('/projects/:uuid', createProjectDemandsRouter(deps.demands));
  // Ahead of the demands router: its static `/watching` must win over `/:uuid`.
  authenticated.use('/demands', createDemandWatchRouter(deps.notifications));
  authenticated.use('/demands', createDemandsRouter(deps.demands));
  authenticated.use('/notifications', createNotificationsRouter(deps.notifications));
  authenticated.use('/logs', createLogsRouter(deps.logs));
  authenticated.use('/dashboard', createDashboardRouter(deps.dashboard));
  authenticated.use('/assistant', createAssistantRouter(deps.assistant));
  authenticated.use('/branding', createBrandingManagementRouter(deps.branding.management));

  api.use(authenticated);
  app.use('/api/v1', api);

  if (env.API_DOCS_ENABLED) {
    app.get('/openapi.json', (_req, res) => res.json(openApiDocument));
    if (process.env.VERCEL) {
      // Vercel ignores express.static, which is how swagger-ui-express serves its bundle;
      // there the same UI loads from a pinned CDN build and reads the spec above.
      app.get('/docs', (_req, res) => res.type('html').send(SWAGGER_CDN_PAGE));
    } else {
      app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'Kanban API' }));
    }
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.systemLogger));

  return app;
}
