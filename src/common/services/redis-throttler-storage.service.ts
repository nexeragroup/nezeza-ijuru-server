import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { RedisService } from './redis.service';

export interface ThrottleIncrementResult {
  readonly totalHits: number;
  readonly timeToExpire: number;
  readonly isBlocked: boolean;
  readonly timeToBlockExpire: number;
}

const THROTTLE_SCRIPT = `
  local hitKey = KEYS[1]
  local blockKey = KEYS[2]

  local ttl = tonumber(ARGV[1])
  local limit = tonumber(ARGV[2])
  local blockDuration = tonumber(ARGV[3])

  local blockTtl = redis.call('PTTL', blockKey)

  if blockTtl > 0 then
    local currentHits =
      tonumber(redis.call('GET', hitKey) or '0')

    local hitTtl =
      redis.call('PTTL', hitKey)

    if hitTtl < 0 then
      hitTtl = blockTtl
    end

    return {
      currentHits,
      hitTtl,
      1,
      blockTtl
    }
  end

  local total =
    redis.call('INCR', hitKey)

  if total == 1 then
    redis.call(
      'PEXPIRE',
      hitKey,
      ttl
    )
  end

  local hitTtl =
    redis.call('PTTL', hitKey)

  if total > limit then
    redis.call(
      'SET',
      blockKey,
      '1',
      'PX',
      blockDuration
    )

    redis.call(
      'PEXPIRE',
      hitKey,
      blockDuration
    )

    return {
      total,
      blockDuration,
      1,
      blockDuration
    }
  end

  return {
    total,
    hitTtl,
    0,
    0
  }
`;

@Injectable()
export class RedisThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottleIncrementResult> {
    this.validateInput(key, ttl, limit, blockDuration, throttlerName);

    const effectiveBlockDuration = blockDuration > 0 ? blockDuration : ttl;

    const digest = createHash('sha256')
      .update(`${throttlerName}\0${key}`)
      .digest('hex');

    /*
     * Redis Cluster hash tag:
     * both Lua keys will always be placed
     * in the same Redis hash slot.
     */
    const slot = `{throttle-${digest}}`;

    const counterKey = `${slot}:hits`;

    const blockKey = `${slot}:blocked`;

    const rawResult = await this.redis.getClient('cache').eval(
      THROTTLE_SCRIPT,

      2,

      counterKey,
      blockKey,

      ttl.toString(),
      limit.toString(),
      effectiveBlockDuration.toString(),
    );

    const result = this.parseResult(rawResult);

    return {
      totalHits: result[0],

      timeToExpire: this.toSeconds(result[1]),

      isBlocked: result[2] === 1,

      timeToBlockExpire: this.toSeconds(result[3]),
    };
  }

  private parseResult(value: unknown): [number, number, number, number] {
    if (!Array.isArray(value) || value.length !== 4) {
      throw new TypeError('Unexpected Redis throttler response');
    }

    const values = value.map((entry) => Number(entry));

    if (values.some((entry) => !Number.isFinite(entry))) {
      throw new TypeError('Redis throttler returned invalid numeric values');
    }

    return [values[0], values[1], values[2], values[3]];
  }

  private toSeconds(milliseconds: number): number {
    return milliseconds > 0 ? Math.ceil(milliseconds / 1_000) : 0;
  }

  private validateInput(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): void {
    if (typeof key !== 'string' || !key) {
      throw new TypeError('Throttle key is required');
    }

    if (typeof throttlerName !== 'string' || !throttlerName) {
      throw new TypeError('Throttler name is required');
    }

    this.assertPositiveInteger(ttl, 'ttl');

    this.assertPositiveInteger(limit, 'limit');

    if (!Number.isSafeInteger(blockDuration) || blockDuration < 0) {
      throw new RangeError('blockDuration must be a non-negative integer');
    }
  }

  private assertPositiveInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive integer`);
    }
  }
}
