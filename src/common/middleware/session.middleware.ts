import {
  Injectable,
  Logger,
  NestMiddleware,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisStore } from 'connect-redis';
import type { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import { createClient, type RedisClientType } from 'redis';
import { resolveSessionCookieName } from '../utils/session-cookie.util';

const DEFAULT_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const MIN_SECRET_BYTES = 32;

@Injectable()
export class SessionMiddleware
  implements NestMiddleware, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SessionMiddleware.name);
  private readonly client: RedisClientType;
  private readonly workerOnly: boolean;
  private handler?: ReturnType<typeof session>;

  constructor(private readonly config: ConfigService) {
    this.workerOnly = this.config.get<string>('app.role', 'all') === 'worker';

    this.client = createClient({
      socket: {
        host: this.config.get<string>('redis.host', 'localhost'),
        port: this.config.get<number>('redis.port', 6379),
        connectTimeout: this.config.get<number>(
          'redis.connectTimeoutMs',
          5_000,
        ),

        ...(this.config.get<boolean>('redis.tls', false)
          ? {
              tls: true as const,
            }
          : {}),
      },

      username: this.config.get<string | undefined>('redis.username'),

      password: this.config.get<string | undefined>('redis.password'),

      /*
       * Session requests should fail quickly during
       * a Redis outage rather than silently queueing
       * authentication/session mutations for later.
       */
      disableOfflineQueue: true,
    });

    this.registerRedisEvents();
  }

  async onModuleInit(): Promise<void> {
    if (this.workerOnly) {
      return;
    }

    this.validateConfiguration();

    try {
      await this.client.connect();

      await this.client.ping();

      this.initializeSessionHandler();

      this.logger.log('Redis session infrastructure is ready');
    } catch (error) {
      this.logger.error(
        'Unable to initialize Redis session infrastructure',
        error instanceof Error ? error.stack : undefined,
      );

      /*
       * Sessions are a security dependency.
       * For the HTTP application, starting without
       * the configured session store is unsafe.
       */
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client.isOpen) {
      return;
    }

    try {
      await this.client.quit();
    } catch (error) {
      this.logger.warn(
        `Redis session connection did not close cleanly: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  isReady(): boolean {
    if (this.workerOnly) {
      return true;
    }

    return this.handler !== undefined && this.client.isReady;
  }

  use(request: Request, response: Response, next: NextFunction): void {
    /*
     * A worker should not normally receive HTTP traffic,
     * but don't return a contradictory 503 if this
     * middleware is accidentally attached there.
     */
    if (this.workerOnly) {
      next();
      return;
    }

    if (!this.handler || !this.client.isReady) {
      throw new ServiceUnavailableException({
        code: 'SESSION_INFRASTRUCTURE_UNAVAILABLE',

        message: 'Session infrastructure is temporarily unavailable',
      });
    }

    /*
     * express-session is callback-style middleware.
     * Passing next directly preserves its errors and
     * lets Nest's global exception layer handle them.
     */
    this.handler(request, response, next);
  }

  private initializeSessionHandler(): void {
    const maxAgeMs = this.getPositiveInteger(
      'security.sessionMaxAgeMs',
      DEFAULT_SESSION_MAX_AGE_MS,
    );

    const secureCookies = this.config.get<boolean>(
      'security.secureCookies',
      false,
    );

    const sameSite = this.config.get<'lax' | 'strict' | 'none'>(
      'security.cookieSameSite',
      'lax',
    );

    const secrets = this.getSessionSecrets();

    const applicationName = this.sanitizeName(
      this.config.get<string>('app.name', 'application'),
    );

    const configuredCookieName = this.config.get<string>(
      'security.sessionCookieName',
    );

    const cookieName = resolveSessionCookieName({
      applicationName,
      configuredCookieName,
      secureCookies,
    });

    const namespace = this.sanitizeName(
      this.config.get<string>('redis.namespace', applicationName),
    );

    const store = new RedisStore({
      client: this.client,

      prefix: `${namespace}:session:`,

      /*
       * connect-redis uses the cookie expiration
       * automatically. This provides a safe fallback
       * for sessions without one.
       */
      ttl: Math.ceil(maxAgeMs / 1_000),

      disableTouch: false,
    });

    this.handler = session({
      store,

      name: cookieName,

      secret: secrets,

      resave: false,

      saveUninitialized: false,

      /*
       * Refresh the browser cookie expiry for active
       * sessions, giving us an inactivity-style timeout.
       */
      rolling: this.config.get<boolean>('security.sessionRolling', true),

      /*
       * If application code explicitly unsets the
       * session, destroy it in Redis.
       */
      unset: 'destroy',

      cookie: {
        httpOnly: true,

        secure: secureCookies,

        sameSite,

        path: '/',

        maxAge: maxAgeMs,
      },
    });
  }

  private getSessionSecrets(): string | string[] {
    const rotatingSecrets = this.config.get<string[] | string>(
      'security.cookieSecrets',
    );

    let secrets: string[];

    if (Array.isArray(rotatingSecrets)) {
      secrets = rotatingSecrets;
    } else if (typeof rotatingSecrets === 'string') {
      secrets = rotatingSecrets.split(',').map((secret) => secret.trim());
    } else {
      secrets = [this.config.getOrThrow<string>('security.cookieSecret')];
    }

    secrets = secrets.filter(Boolean);

    if (!secrets.length) {
      throw new Error('At least one session cookie secret must be configured');
    }

    for (const secret of secrets) {
      if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
        throw new Error(
          'Every session cookie secret must contain at least 32 bytes',
        );
      }
    }

    return secrets.length === 1 ? secrets[0] : secrets;
  }

  private validateConfiguration(): void {
    const secureCookies = this.config.get<boolean>(
      'security.secureCookies',
      false,
    );

    const sameSite = this.config.get<'lax' | 'strict' | 'none'>(
      'security.cookieSameSite',
      'lax',
    );

    const nodeEnv = this.config.get<string>(
      'app.environment',
      process.env.NODE_ENV ?? 'development',
    );

    if (sameSite === 'none' && !secureCookies) {
      throw new Error('SameSite=None requires security.secureCookies=true');
    }

    if (nodeEnv === 'production' && !secureCookies) {
      throw new Error('security.secureCookies must be true in production');
    }

    /*
     * Resolve secrets during startup so configuration
     * errors fail immediately rather than on first request.
     */
    this.getSessionSecrets();
  }

  private registerRedisEvents(): void {
    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis session error: ${error.message}`);
    });

    this.client.on('ready', () => {
      this.logger.log('Redis session connection ready');
    });

    this.client.on('end', () => {
      this.logger.warn('Redis session connection closed');
    });
  }

  private getPositiveInteger(key: string, fallback: number): number {
    const value = this.config.get<number>(key, fallback);

    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${key} must be a positive integer`);
    }

    return value;
  }

  private sanitizeName(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '');

    return normalized || 'application';
  }
}
