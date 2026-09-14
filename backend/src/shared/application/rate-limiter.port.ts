export interface RateLimitDecision {
  allowed: boolean;
  /** Zero when allowed. */
  retryAfterSeconds: number;
}

/** Counts one attempt against `key` and says whether it may proceed. */
export interface RateLimiter {
  consume(key: string): RateLimitDecision;
}
