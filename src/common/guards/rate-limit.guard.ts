import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '../decorators/rate-limit.decorator';
import type { AuthenticatedUser } from '../types/auth-request.interface';
import { RedisThrottlerStorage } from '../services/redis-throttler-storage.service';

interface RateLimitRequest extends Request {
  user?: AuthenticatedUser;
}

const DEFAULT_RATE_LIMIT: Readonly<RateLimitOptions> = Object.freeze({
  limit: 100,
  ttlMs: 60_000,
  blockDurationMs: 60_000,
});

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,

    private readonly storage: RedisThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_RATE_LIMIT;

    const request = context.switchToHttp().getRequest<RateLimitRequest>();

    const response = context.switchToHttp().getResponse<Response>();

    const tracker = this.getTracker(request);

    const routeIdentity = this.getRouteIdentity(context, request);

    const key = this.generateKey(routeIdentity, tracker);

    const result = await this.storage.increment(
      key,

      options.ttlMs,

      options.limit,

      options.blockDurationMs,

      'http',
    );

    this.setRateLimitHeaders(
      response,
      options.limit,
      result.totalHits,
      result.timeToExpire,
    );

    if (result.isBlocked) {
      const retryAfterSeconds = Math.max(
        1,
        result.timeToBlockExpire || result.timeToExpire,
      );

      /*
       * Retry-After is defined in seconds when
       * represented as an integer.
       */
      response.setHeader('Retry-After', retryAfterSeconds.toString());

      /*
       * 429 responses must not be cached.
       */
      response.setHeader('Cache-Control', 'no-store');

      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getTracker(request: RateLimitRequest): string {
    /*
     * Prefer an authenticated identity.
     *
     * "sub" should be the stable immutable identifier
     * for AuthenticatedUser.
     */
    if (request.user?.sub) {
      return `user:${request.user.sub}`;
    }

    const ip = request.ip || request.socket.remoteAddress;

    if (ip) {
      return `ip:${ip}`;
    }

    /*
     * Express normally provides an IP. If it somehow
     * cannot, use a deterministic fallback rather than
     * crashing the request pipeline.
     */
    return 'ip:unknown';
  }

  private getRouteIdentity(
    context: ExecutionContext,
    request: Request,
  ): string {
    return [
      request.method.toUpperCase(),
      context.getClass().name,
      context.getHandler().name,
    ].join(':');
  }

  private generateKey(routeIdentity: string, tracker: string): string {
    const digest = createHash('sha256')
      .update(`v1:${routeIdentity}:${tracker}`)
      .digest('hex');

    return `rate-limit:${digest}`;
  }

  private setRateLimitHeaders(
    response: Response,
    limit: number,
    totalHits: number,
    timeToExpire: number,
  ): void {
    const remaining = Math.max(0, limit - totalHits);

    /*
     * The storage-compatible throttler record returns
     * expiration duration in seconds.
     *
     * X-RateLimit-Reset is represented here as a Unix
     * timestamp to avoid ambiguity.
     */
    const resetAt = Math.floor(Date.now() / 1_000) + Math.max(0, timeToExpire);

    response.setHeader('X-RateLimit-Limit', limit.toString());

    response.setHeader('X-RateLimit-Remaining', remaining.toString());

    response.setHeader('X-RateLimit-Reset', resetAt.toString());
  }
}
