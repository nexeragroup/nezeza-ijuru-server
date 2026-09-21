import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisService } from './redis.service';

interface CacheEnvelope<T> {
  readonly version: 1;
  readonly value: T;
}

type CacheReadResult<T> =
  | {
      readonly hit: true;
      readonly value: T;
    }
  | {
      readonly hit: false;
    };

const CACHE_ENVELOPE_VERSION = 1;

const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_SCAN_COUNT = 100;

const MAX_CACHE_KEY_LENGTH = 1_024;
const MAX_TTL_SECONDS = 31_536_000; // 1 year

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  /**
   * Prevents duplicate factory execution within the same
   * application instance when multiple requests miss the
   * same cache key at the same time.
   *
   * This is not a distributed lock. It protects one process.
   */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const result = await this.read<T>(key);

    return result.hit ? result.value : null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.enabled()) {
      return;
    }

    this.assertKey(key);

    const ttl = this.normalizeTtl(ttlSeconds);

    try {
      const envelope: CacheEnvelope<T> = {
        version: CACHE_ENVELOPE_VERSION,
        value,
      };

      const serialized = JSON.stringify(envelope);

      if (serialized === undefined) {
        throw new TypeError('Cache value could not be serialized');
      }

      await this.redis.getClient('cache').set(key, serialized, 'EX', ttl);
    } catch (error) {
      this.logger.warn(
        `Cache write failed for key "${key}": ${this.getErrorMessage(error)}`,
      );
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.enabled()) {
      return;
    }

    this.assertKey(key);

    try {
      /*
       * UNLINK performs the expensive memory reclamation
       * asynchronously on Redis instead of blocking the
       * Redis event loop like DEL potentially can.
       */
      await this.redis.getClient('cache').unlink(key);
    } catch (error) {
      this.logger.warn(
        `Cache delete failed for key "${key}": ${this.getErrorMessage(error)}`,
      );
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    if (!this.enabled()) {
      return factory();
    }

    this.assertKey(key);

    const cached = await this.read<T>(key);

    if (cached.hit) {
      return cached.value;
    }

    /*
     * Single-flight:
     *
     * 50 concurrent requests missing "users:123"
     * should execute the factory once per application
     * instance rather than 50 times.
     */
    const existing = this.inflight.get(key);

    if (existing) {
      return existing as Promise<T>;
    }

    const promise = this.loadAndCache(key, factory, ttlSeconds);

    this.inflight.set(key, promise);

    try {
      return await promise;
    } finally {
      if (this.inflight.get(key) === promise) {
        this.inflight.delete(key);
      }
    }
  }

  async invalidateByPrefix(prefix: string): Promise<number> {
    if (!this.enabled()) {
      return 0;
    }

    this.assertKey(prefix);

    const client = this.redis.getClient('cache');

    const redisPrefix = this.redis.getKeyPrefix('cache');

    /*
     * ioredis does NOT apply keyPrefix automatically
     * to SCAN MATCH patterns.
     */
    const pattern = `${redisPrefix}${this.escapeRedisGlob(prefix)}*`;

    const scanCount = this.normalizeScanCount();

    let deleted = 0;

    try {
      const stream = client.scanStream({
        match: pattern,
        count: scanCount,
      });

      for await (const scannedKeys of stream) {
        if (!Array.isArray(scannedKeys) || scannedKeys.length === 0) {
          continue;
        }

        /*
         * SCAN returns the physical Redis keys including
         * our namespace prefix.
         *
         * Because ioredis will add keyPrefix again to UNLINK,
         * strip it first.
         */
        const logicalKeys = scannedKeys
          .filter(
            (key): key is string =>
              typeof key === 'string' && key.startsWith(redisPrefix),
          )
          .map((key) => key.slice(redisPrefix.length));

        if (logicalKeys.length === 0) {
          continue;
        }

        deleted += await client.unlink(...logicalKeys);
      }
    } catch (error) {
      this.logger.warn(
        `Cache prefix invalidation failed for "${prefix}": ${this.getErrorMessage(error)}`,
      );
    }

    return deleted;
  }

  private async read<T>(key: string): Promise<CacheReadResult<T>> {
    if (!this.enabled()) {
      return {
        hit: false,
      };
    }

    this.assertKey(key);

    try {
      const value = await this.redis.getClient('cache').get(key);

      if (value === null) {
        return {
          hit: false,
        };
      }

      const parsed: unknown = JSON.parse(value);

      /*
       * New enterprise cache format.
       */
      if (this.isCacheEnvelope<T>(parsed)) {
        return {
          hit: true,
          value: parsed.value,
        };
      }

      /*
       * Backward compatibility with existing
       * cache entries written before envelopes
       * were introduced.
       */
      return {
        hit: true,
        value: parsed as T,
      };
    } catch (error) {
      this.logger.warn(
        `Cache read failed for key "${key}"; using authoritative source: ${this.getErrorMessage(error)}`,
      );

      return {
        hit: false,
      };
    }
  }

  private async loadAndCache<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    /*
     * Check once more after entering single-flight.
     * Another request may have populated the cache.
     */
    const cached = await this.read<T>(key);

    if (cached.hit) {
      return cached.value;
    }

    const value = await factory();

    await this.set(key, value, ttlSeconds);

    return value;
  }

  private normalizeTtl(ttlSeconds?: number): number {
    const value =
      ttlSeconds ??
      this.config.get<number>('cache.ttlSeconds', DEFAULT_TTL_SECONDS);

    if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_TTL_SECONDS) {
      throw new RangeError(
        `Cache TTL must be an integer between 1 and ${MAX_TTL_SECONDS} seconds`,
      );
    }

    return value;
  }

  private normalizeScanCount(): number {
    const value = this.config.get<number>(
      'cache.scanCount',
      DEFAULT_SCAN_COUNT,
    );

    if (!Number.isSafeInteger(value) || value <= 0) {
      return DEFAULT_SCAN_COUNT;
    }

    return value;
  }

  private assertKey(key: string): void {
    if (
      typeof key !== 'string' ||
      key.length === 0 ||
      key.length > MAX_CACHE_KEY_LENGTH ||
      /[\r\n\0]/.test(key)
    ) {
      throw new TypeError('Invalid cache key');
    }
  }

  private escapeRedisGlob(value: string): string {
    return value.replace(/([\\*?[\]])/g, '\\$1');
  }

  private isCacheEnvelope<T>(value: unknown): value is CacheEnvelope<T> {
    return (
      typeof value === 'object' &&
      value !== null &&
      'version' in value &&
      value.version === CACHE_ENVELOPE_VERSION &&
      'value' in value
    );
  }

  private enabled(): boolean {
    return this.config.get<boolean>('cache.enabled', true);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
