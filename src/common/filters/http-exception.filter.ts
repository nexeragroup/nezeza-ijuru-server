import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AppLogger } from '../services/app-logger.service';

type ErrorMessage = string | string[];

interface ExceptionResponsePayload {
  message?: unknown;
  error?: unknown;
  code?: unknown;
}

interface RequestWithContext extends Request {
  requestId?: string;
  traceId?: string;

  user?: {
    sub?: string;
  };
}

interface ClientErrorDetails {
  message: ErrorMessage;
  error: string;
  code?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();

    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithContext>();

    const statusCode = this.getStatusCode(exception);
    const path = this.getRequestPath(request);

    const requestId = this.toSafeString(
      request.requestId ?? request.headers['x-request-id'],
      100,
    );

    const traceId = this.toSafeString(
      request.traceId ?? request.headers['x-trace-id'],
      100,
    );

    const userAgent = this.toSafeString(request.headers['user-agent'], 1_024);

    const errorDetails = this.getClientErrorDetails(exception, statusCode);

    /*
     * 4xx responses normally represent expected client-side failures
     * and should already be captured by the HTTP request logger.
     *
     * Only server-side failures are recorded here as application errors
     * so that validation failures, 404s, 401s, etc. do not pollute the
     * application error stream.
     */
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.logError(
        'Unhandled HTTP exception',
        {
          statusCode,
          method: request.method,
          path,
          requestId,
          traceId,
          userId: request.user?.sub,
          ipAddress: request.ip,
          userAgent,
        },
        exception,
      );
    }

    /*
     * An exception may occur after streaming or another response writer
     * has already started sending data. Never attempt to send a second
     * response in that situation.
     */
    if (response.headersSent) {
      return;
    }

    response.status(statusCode).json({
      statusCode,
      error: errorDetails.error,
      message: errorDetails.message,

      ...(errorDetails.code
        ? {
            code: errorDetails.code,
          }
        : {}),

      timestamp: new Date().toISOString(),
      path,

      ...(requestId
        ? {
            requestId,
          }
        : {}),
    });
  }

  private getStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getClientErrorDetails(
    exception: unknown,
    statusCode: number,
  ): ClientErrorDetails {
    /*
     * Never expose unexpected server exception messages to clients.
     */
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return {
        error: 'Internal Server Error',
        message: 'Internal server error',
      };
    }

    if (!(exception instanceof HttpException)) {
      return {
        error: this.getStatusLabel(statusCode),
        message: 'Request failed',
      };
    }

    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return {
        error: this.getStatusLabel(statusCode),
        message: this.truncate(exceptionResponse, 2_000),
      };
    }

    if (this.isRecord(exceptionResponse)) {
      const payload = exceptionResponse as ExceptionResponsePayload;

      return {
        error:
          this.toSafeString(payload.error, 200) ??
          this.getStatusLabel(statusCode),

        message: this.normalizeMessage(payload.message, exception.message),

        ...(this.toSafeString(payload.code, 100)
          ? {
              code: this.toSafeString(payload.code, 100),
            }
          : {}),
      };
    }

    return {
      error: this.getStatusLabel(statusCode),
      message: this.truncate(exception.message || 'Request failed', 2_000),
    };
  }

  private normalizeMessage(value: unknown, fallback: string): ErrorMessage {
    if (typeof value === 'string' && value.length > 0) {
      return this.truncate(value, 2_000);
    }

    if (Array.isArray(value)) {
      const messages = value
        .filter(
          (item): item is string => typeof item === 'string' && item.length > 0,
        )
        .slice(0, 50)
        .map((item) => this.truncate(item, 2_000));

      if (messages.length > 0) {
        return messages;
      }
    }

    return this.truncate(fallback || 'Request failed', 2_000);
  }

  private getRequestPath(request: Request): string {
    const url = request.originalUrl || request.url || '/';

    /*
     * Avoid logging query strings because they may contain
     * personal data, search terms, tokens, or other secrets.
     */
    return url.split(/[?#]/, 1)[0] || '/';
  }

  private getStatusLabel(statusCode: number): string {
    const statusName = HttpStatus[statusCode];

    if (typeof statusName !== 'string') {
      return 'Request Error';
    }

    return statusName
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  }

  private toSafeString(value: unknown, maxLength: number): string | undefined {
    if (Array.isArray(value)) {
      return this.toSafeString(value[0], maxLength);
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();

    if (!normalized) {
      return undefined;
    }

    return this.truncate(normalized, maxLength);
  }

  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
