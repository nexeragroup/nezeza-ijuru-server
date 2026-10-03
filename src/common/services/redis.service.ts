import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';

export type RedisClientName = 'cache' | 'queue';

export type BullConnectionRole = 'producer' | 'worker';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private readonly clients = new Map<RedisClientName, Redis>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const clients: RedisClientName[] = [];

    if (this.config.get<boolean>('cache.enabled', true)) {
      clients.push('cache');
    }

    if (this.config.get<boolean>('queue.enabled', true)) {
      clients.push('queue');
    }

    for (const name of clients) {
      const client = this.createClient(name);

      try {
        await client.connect();

        this.logger.log(`Redis ${name} connection initialized`);
      } catch (error) {
        /*
         * ioredis retryStrategy will continue trying to
         * reconnect after transient connectivity failures.
         *
         * Do not hide startup failures.
         */
        this.logger.error(
          `Redis ${name} initial connection failed: ${this.getErrorMessage(error)}`,
        );
      }
    }
  }

  getClient(name: RedisClientName): Redis {
    const existing = this.clients.get(name);

    if (existing) {
      return existing;
    }

    const client = this.createClient(name);

    /*
     * Clients requested outside normal module initialization
     * are connected asynchronously. Cache callers already
     * degrade gracefully if Redis is unavailable.
     */
    void client.connect().catch((error) => {
      this.logger.error(
        `Redis ${name} connection failed: ${this.getErrorMessage(error)}`,
      );
    });

    return client;
  }

  getKeyPrefix(name: RedisClientName): string {
    const namespace = this.getNamespace();

    return `${namespace}:${name}:`;
  }

  /**
   * BullMQ workers require maxRetriesPerRequest=null so they
   * can keep waiting for Redis indefinitely.
   *
   * Producers servicing HTTP requests should fail quickly
   * instead of making a caller wait indefinitely.
   */
  getBullConnection(role: BullConnectionRole = 'producer'): ConnectionOptions {
    return {
      host: this.config.get<string>('redis.host', 'localhost'),
      port: this.config.get<number>('redis.port', 6379),
      username: this.config.get<string | undefined>('redis.username'),
      password: this.config.get<string | undefined>('redis.password'),
      tls: this.config.get<boolean>('redis.tls', false) ? {} : undefined,
      connectTimeout: this.config.get<number>('redis.connectTimeoutMs', 5_000),
      maxRetriesPerRequest: role === 'worker' ? null : 1,
      enableReadyCheck: true,

      retryStrategy: this.createRetryStrategy(),
    };
  }

  async ping(name: RedisClientName = 'cache'): Promise<boolean> {
    try {
      const response = await this.getClient(name).ping();

      return response === 'PONG';
    } catch (error) {
      this.logger.warn(
        `Redis ${name} health check failed: ${this.getErrorMessage(error)}`,
      );

      return false;
    }
  }

  isReady(name: RedisClientName): boolean {
    return this.clients.get(name)?.status === 'ready';
  }

  async onModuleDestroy(): Promise<void> {
    const clients = [...this.clients.entries()];

    await Promise.allSettled(
      clients.map(async ([name, client]) => {
        if (client.status === 'end') {
          return;
        }

        try {
          await client.quit();
        } catch (error) {
          this.logger.warn(
            `Redis ${name} graceful shutdown failed: ${this.getErrorMessage(error)}`,
          );

          client.disconnect();
        }
      }),
    );

    this.clients.clear();
  }

  private createClient(name: RedisClientName): Redis {
    const existing = this.clients.get(name);

    if (existing) {
      return existing;
    }

    const cacheClient = name === 'cache';

    const client = new Redis({
      host: this.config.get<string>('redis.host', 'localhost'),

      port: this.config.get<number>('redis.port', 6379),

      username: this.config.get<string | undefined>('redis.username'),

      password: this.config.get<string | undefined>('redis.password'),

      keyPrefix: this.getKeyPrefix(name),

      connectTimeout: this.config.get<number>('redis.connectTimeoutMs', 5_000),

      commandTimeout: this.config.get<number>('redis.commandTimeoutMs', 2_000),

      tls: this.config.get<boolean>('redis.tls', false) ? {} : undefined,

      lazyConnect: true,

      enableReadyCheck: true,

      /*
       * Cache operations should fail quickly.
       *
       * Queue infrastructure may legitimately need to
       * remain connected/retrying for longer.
       */
      maxRetriesPerRequest: cacheClient ? 1 : null,

      enableOfflineQueue: !cacheClient,

      retryStrategy: this.createRetryStrategy(),
    });

    this.registerEvents(name, client);

    this.clients.set(name, client);

    return client;
  }

  private createRetryStrategy(): (times: number) => number {
    return (times: number): number => {
      /*
       * Exponential backoff with jitter prevents every
       * application instance reconnecting simultaneously.
       */
      const baseDelay = Math.min(50 * 2 ** Math.min(times - 1, 8), 5_000);

      const jitter = Math.floor(Math.random() * 200);

      return baseDelay + jitter;
    };
  }

  private registerEvents(name: RedisClientName, client: Redis): void {
    client.on('ready', () => {
      this.logger.log(`Redis ${name} connection ready`);
    });

    client.on('reconnecting', (delay: number) => {
      this.logger.warn(`Redis ${name} reconnecting in ${delay}ms`);
    });

    client.on('error', (error: Error) => {
      this.logger.error(`Redis ${name} error: ${error.message}`);
    });

    client.on('close', () => {
      this.logger.warn(`Redis ${name} connection closed`);
    });

    client.on('end', () => {
      this.logger.warn(`Redis ${name} connection ended`);
    });
  }

  private getNamespace(): string {
    return this.config.get<string>('redis.namespace', 'centralized-api');
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
