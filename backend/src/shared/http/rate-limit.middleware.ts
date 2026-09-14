import { type NextFunction, type Request, type Response } from 'express';
import { type RateLimiter } from '../application/rate-limiter.port';
import { DomainError } from '../domain/errors';

/**
 * Per-client throttle for public endpoints — the ones reachable without a session, where
 * the user-keyed limits elsewhere cannot apply.
 *
 * `req.ip` honours `trust proxy`, so behind Docker's or Vercel's proxy it is the caller's
 * address rather than the proxy's — with one exception worth designing for: when the API
 * is reached through the frontend's same-origin rewrite, Vercel overwrites
 * `X-Forwarded-For` with the rewrite proxy's own address, so every browser user arrives
 * with the same `req.ip`. `discriminator` narrows the key with something the request itself
 * carries (the account being signed into, the API key being exchanged), so one abusive
 * caller exhausts only their own bucket instead of everyone's.
 *
 * The limits chosen at the call sites are deliberately generous: the goal is damping abuse
 * (log-row spam on login, CPU-bound scrypt verification on the token exchange), not metering.
 */
export function rateLimitByIp(
  limiter: RateLimiter,
  scope: string,
  message: string,
  discriminator?: (req: Request) => string | undefined,
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const extra = discriminator?.(req);
    const key = [scope, req.ip ?? 'unknown', ...(extra ? [extra.slice(0, 128)] : [])].join(':');
    const decision = limiter.consume(key);
    if (decision.allowed) {
      next();
      return;
    }
    next(DomainError.rateLimited('RATE_LIMITED', message, decision.retryAfterSeconds));
  };
}

/** Reads a string field from a JSON body without trusting its shape. */
export function bodyField(field: string) {
  return (req: Request): string | undefined => {
    const value = (req.body as Record<string, unknown> | undefined)?.[field];
    return typeof value === 'string' ? value : undefined;
  };
}
