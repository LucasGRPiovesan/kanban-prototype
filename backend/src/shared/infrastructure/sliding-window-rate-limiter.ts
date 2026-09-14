import { type RateLimitDecision, type RateLimiter } from '../application/rate-limiter.port';

/**
 * At most `limit` attempts per key within any `windowMs`.
 *
 * A sliding window rather than a fixed one: a fixed per-minute bucket lets a caller spend
 * the whole quota at 00:59 and again at 01:00. In memory, so it holds per process — right
 * for a single API instance; several instances would share it through Redis instead (see
 * docs/IMPROVEMENTS.md).
 *
 * Keys can also be client IPs (public endpoints), which an attacker controls the number of,
 * so the map is bounded: once it grows past `maxKeys`, every key whose attempts have all
 * left the window is dropped — those carry no state worth keeping anyway.
 */
export class SlidingWindowRateLimiter implements RateLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly maxKeys = 10_000,
  ) {}

  consume(key: string): RateLimitDecision {
    const now = this.now();
    if (this.attempts.size >= this.maxKeys && !this.attempts.has(key)) {
      this.evictExpired(now);
      // Still full of live keys (a flood of distinct callers): forget the oldest one. A
      // hard ceiling on memory matters more than perfect accounting for that one key.
      if (this.attempts.size >= this.maxKeys) {
        const oldest = this.attempts.keys().next().value;
        if (oldest !== undefined) {
          this.attempts.delete(oldest);
        }
      }
    }
    const recent = (this.attempts.get(key) ?? []).filter((at) => now - at < this.windowMs);

    if (recent.length >= this.limit) {
      this.attempts.set(key, recent);
      const oldest = recent[0]!;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((this.windowMs - (now - oldest)) / 1000)),
      };
    }

    recent.push(now);
    this.attempts.set(key, recent);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Tracked keys, for tests and diagnostics. */
  size(): number {
    return this.attempts.size;
  }

  private evictExpired(now: number): void {
    for (const [key, timestamps] of this.attempts) {
      if (timestamps.every((at) => now - at >= this.windowMs)) {
        this.attempts.delete(key);
      }
    }
  }
}
