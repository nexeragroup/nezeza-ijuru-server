import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'security:rate-limit' as const;

export interface RateLimitOptions {
  readonly limit: number;

  /**
   * Rate-limit window in milliseconds.
   */
  readonly ttlMs: number;

  /**
   * Duration for which requests remain blocked
   * after exceeding the limit.
   */
  readonly blockDurationMs: number;
}

export const RateLimit = (
  limit: number,
  ttlMs = 60_000,
  blockDurationMs = ttlMs,
) => {
  assertPositiveInteger(limit, 'limit');
  assertPositiveInteger(ttlMs, 'ttlMs');
  assertPositiveInteger(blockDurationMs, 'blockDurationMs');

  const options: RateLimitOptions = Object.freeze({
    limit,
    ttlMs,
    blockDurationMs,
  });

  return SetMetadata(RATE_LIMIT_KEY, options);
};

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`Rate limit ${name} must be a positive integer`);
  }
}
