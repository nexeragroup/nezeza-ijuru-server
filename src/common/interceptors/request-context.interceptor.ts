import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

import type { AuthenticatedUser } from '../types/auth-request.interface';
import { AppLogger } from '../services/app-logger.service';

const REQUEST_ID_HEADER = 'x-request-id';
const TRACE_ID_HEADER = 'x-trace-id';

const MAX_CORRELATION_ID_LENGTH = 128;

/**
 * Internal status used only for logging when the client closes
 * the connection before the HTTP response is completed.
 *
 * 499 is commonly used by reverse proxies for this condition,
 * but is not returned by this interceptor to the client.
 */
const CLIENT_CLOSED_REQUEST_STATUS = 499;

interface RequestWithContext extends Request {
  requestId?: string;
  traceId?: string;
  user?: AuthenticatedUser;
}

interface DeviceMetadata {
  deviceType?: string;
  os?: string;
  browser?: string;
}

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    /*
     * This interceptor is HTTP-specific.
     *
     * If registered globally, allowing non-HTTP execution contexts
     * to pass through prevents WebSocket/RPC handlers from breaking.
     */
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();

    const request = http.getRequest<RequestWithContext>();

    const response = http.getResponse<Response>();

    const requestId = this.resolveCorrelationId(request.get(REQUEST_ID_HEADER));

    const traceId = this.resolveCorrelationId(
      request.get(TRACE_ID_HEADER),
      requestId,
    );

    /*
     * Attach IDs to the request so exception filters, guards,
     * controllers, and other infrastructure components can
     * access the same correlation context.
     */
    request.requestId = requestId;
    request.traceId = traceId;

    /*
     * Always return correlation identifiers to the caller.
     */
    response.setHeader('X-Request-Id', requestId);

    response.setHeader('X-Trace-Id', traceId);

    const startedAt = performance.now();

    const metadata = {
      requestId,
      traceId,

      ipAddress: this.normalizeString(request.ip, 64),

      userAgent: this.normalizeString(request.get('user-agent'), 2_048),

      userId: request.user?.sub,

      device: this.getDeviceMetadata(request),
    };

    this.logger.logRequestStart({
      method: request.method,

      path: this.getRequestPath(request),

      ...metadata,
    });

    let requestLogged = false;

    const logRequest = (aborted: boolean): void => {
      if (requestLogged) {
        return;
      }

      requestLogged = true;

      const durationMs = Math.max(0, Math.round(performance.now() - startedAt));

      const statusCode =
        aborted && !response.writableFinished
          ? CLIENT_CLOSED_REQUEST_STATUS
          : response.statusCode;

      this.logger.logRequest(
        request.method,
        this.getRequestPath(request),
        durationMs,
        {
          ...metadata,
          statusCode,

          ...(aborted
            ? {
                aborted: true,
              }
            : {}),
        },
      );
    };

    /*
     * "finish" means the HTTP response has been successfully
     * handed off by Node's HTTP layer.
     *
     * At this point exception filters have already had the chance
     * to set the final response status.
     */
    response.once('finish', () => logRequest(false));

    /*
     * "close" may occur before "finish" when the client disconnects.
     *
     * The idempotency guard above prevents duplicate logs because
     * close may also occur after a normal finish.
     */
    response.once('close', () => {
      if (!response.writableFinished) {
        logRequest(true);
      }
    });

    return next.handle();
  }

  private resolveCorrelationId(
    candidate: string | undefined,
    fallback?: string,
  ): string {
    const normalized = this.normalizeCorrelationId(candidate);

    if (normalized) {
      return normalized;
    }

    return fallback ?? randomUUID();
  }

  private normalizeCorrelationId(value: string | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();

    if (
      normalized.length === 0 ||
      normalized.length > MAX_CORRELATION_ID_LENGTH
    ) {
      return null;
    }

    /*
     * Prevent control characters, whitespace injection,
     * and unsafe values from reaching logs/response headers.
     *
     * Allows common UUID, ULID, trace, and correlation
     * identifier formats.
     */
    if (!/^[A-Za-z0-9._:-]+$/.test(normalized)) {
      return null;
    }

    return normalized;
  }

  private getRequestPath(request: Request): string {
    const value = request.originalUrl || request.url || '/';

    /*
     * Do not place query parameters into request logs.
     *
     * Query strings can contain search terms, personal data,
     * reset tokens, invitation codes, and other sensitive data.
     */
    return value.split(/[?#]/, 1)[0] || '/';
  }

  private getDeviceMetadata(request: Request): DeviceMetadata | undefined {
    const platform = this.normalizeClientHint(
      request.get('sec-ch-ua-platform'),
      255,
    );

    const browser = this.normalizeClientHint(request.get('sec-ch-ua'), 512);

    const mobile = request.get('sec-ch-ua-mobile');

    let deviceType: string | undefined;

    if (mobile === '?1') {
      deviceType = 'mobile';
    } else if (mobile === '?0') {
      deviceType = 'desktop';
    }

    const device: DeviceMetadata = {
      ...(deviceType
        ? {
            deviceType,
          }
        : {}),

      ...(platform
        ? {
            os: platform,
          }
        : {}),

      ...(browser
        ? {
            browser,
          }
        : {}),
    };

    return Object.keys(device).length ? device : undefined;
  }

  private normalizeClientHint(
    value: string | undefined,
    maxLength: number,
  ): string | undefined {
    const normalized = this.normalizeString(value, maxLength);

    if (!normalized) {
      return undefined;
    }

    /*
     * sec-ch-ua-platform commonly arrives quoted:
     *
     * "macOS"
     *
     * Store the useful value rather than the surrounding quotes.
     */
    return normalized.replace(/^"(.*)"$/, '$1');
  }

  private normalizeString(
    value: string | undefined,
    maxLength: number,
  ): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();

    if (!normalized) {
      return undefined;
    }

    return normalized.length > maxLength
      ? normalized.slice(0, maxLength)
      : normalized;
  }
}
