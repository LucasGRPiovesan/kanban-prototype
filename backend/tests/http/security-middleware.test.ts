import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { originGuard } from '../../src/shared/http/origin-guard.middleware';
import { bodyField, rateLimitByIp } from '../../src/shared/http/rate-limit.middleware';
import { SlidingWindowRateLimiter } from '../../src/shared/infrastructure/sliding-window-rate-limiter';
import { DomainError, isDomainError } from '../../src/shared/domain/errors';

/** A tiny app with the middleware under test and an error handler that exposes the code. */
function appWith(...middleware: express.RequestHandler[]) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(...middleware);
  app.all('*', (_req, res) => res.status(204).end());
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const domain = isDomainError(error) ? error : DomainError.invariant('X', 'x');
    res.status(domain.kind === 'RATE_LIMITED' ? 429 : 403).json({ code: domain.code });
  });
  return app;
}

describe('originGuard (CSRF)', () => {
  const app = appWith(originGuard(['http://localhost:8080', 'https://kanban.example.com']));

  it('lets safe methods through from any origin', async () => {
    const response = await request(app).get('/x').set('Origin', 'https://evil.example');
    expect(response.status).toBe(204);
  });

  it('lets requests without Origin through (non-browser clients)', async () => {
    expect((await request(app).post('/x')).status).toBe(204);
  });

  it('accepts an allowed origin, case- and trailing-slash-insensitively', async () => {
    const response = await request(app).post('/x').set('Origin', 'HTTPS://Kanban.Example.com');
    expect(response.status).toBe(204);
  });

  it('refuses a state-changing request from a foreign origin', async () => {
    for (const method of ['post', 'patch', 'put', 'delete'] as const) {
      const response = await request(app)[method]('/x').set('Origin', 'https://evil.example');
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('ORIGIN_NOT_ALLOWED');
    }
  });

  it('refuses the opaque "null" origin of sandboxed frames and data: pages', async () => {
    const response = await request(app).post('/x').set('Origin', 'null');
    expect(response.status).toBe(403);
  });

  it('accepts the API own host (Swagger UI) and a reverse proxy forwarding the browser host', async () => {
    const own = await request(app).post('/x').set('Host', 'api.example.com').set('Origin', 'https://api.example.com');
    expect(own.status).toBe(204);

    const proxied = await request(app)
      .post('/x')
      .set('Host', 'api.internal:3333')
      .set('X-Forwarded-Host', 'kanban.company.com')
      .set('Origin', 'https://kanban.company.com');
    expect(proxied.status).toBe(204);
  });

  it('does not confuse a look-alike host with an allowed one', async () => {
    const response = await request(app).post('/x').set('Origin', 'https://kanban.example.com.evil.example');
    expect(response.status).toBe(403);
  });
});

describe('rateLimitByIp', () => {
  it('throttles one address after the limit, with Retry-After data, independently per address', async () => {
    const limiter = new SlidingWindowRateLimiter(2, 60_000);
    const app = appWith(rateLimitByIp(limiter, 'login', 'Devagar.'));

    const from = (ip: string) => request(app).post('/x').set('X-Forwarded-For', ip);
    expect((await from('10.0.0.1')).status).toBe(204);
    expect((await from('10.0.0.1')).status).toBe(204);
    const refused = await from('10.0.0.1');
    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe('RATE_LIMITED');

    expect((await from('10.0.0.2')).status).toBe(204);
  });
});

describe('rateLimitByIp behind a shared proxy address', () => {
  it('keeps one account bucket from exhausting another when every caller shares an IP', async () => {
    const limiter = new SlidingWindowRateLimiter(1, 60_000);
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.post('/login', rateLimitByIp(limiter, 'login', 'Devagar.', bodyField('userUuid')), (_req, res) => res.status(204).end());
    app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(isDomainError(error) && error.kind === 'RATE_LIMITED' ? 429 : 500).end();
    });

    // Vercel's rewrite proxy: the same X-Forwarded-For for every browser.
    const as = (userUuid: unknown) =>
      request(app).post('/login').set('X-Forwarded-For', '76.76.21.21').send({ userUuid });

    expect((await as('user-a')).status).toBe(204);
    expect((await as('user-a')).status).toBe(429);
    expect((await as('user-b')).status).toBe(204);
    // A body without the field still falls back to the plain per-IP bucket.
    expect((await as(42)).status).toBe(204);
    expect((await as(undefined)).status).toBe(429);
  });
});

describe('SlidingWindowRateLimiter', () => {
  it('forgets keys whose attempts left the window once it reaches its key ceiling', () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter(5, 1000, () => now, 3);
    limiter.consume('a');
    limiter.consume('b');
    limiter.consume('c');
    now = 5000;
    limiter.consume('d');
    expect(limiter.size()).toBe(1);
  });

  it('never grows past its ceiling, even when every key is still live', () => {
    const limiter = new SlidingWindowRateLimiter(5, 60_000, () => 0, 3);
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      limiter.consume(key);
    }
    expect(limiter.size()).toBe(3);
  });

  it('still refuses within the window', () => {
    const limiter = new SlidingWindowRateLimiter(1, 1000, () => 0);
    expect(limiter.consume('k').allowed).toBe(true);
    const second = limiter.consume('k');
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSeconds).toBe(1);
  });
});
