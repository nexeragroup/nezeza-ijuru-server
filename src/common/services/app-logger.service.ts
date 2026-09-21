import { Injectable, Logger } from '@nestjs/common';

import {
  AuditLogLevel,
  type AuditLogDevice,
} from '../../modules/audit-logs/entity/audit-log.entity';

import {
  AuditLogsService,
  type RecordAuditLogInput,
} from '../../modules/audit-logs/audit-logs.service';

export type AuditLogMetadata = Record<string, unknown>;

export interface RequestAuditLogMetadata extends AuditLogMetadata {
  requestId?: unknown;
  traceId?: unknown;

  statusCode?: unknown;

  ipAddress?: unknown;
  userAgent?: unknown;

  userId?: unknown;

  device?: unknown;
}

const MAX_LOG_MESSAGE_LENGTH = 4_096;
const MAX_METADATA_STRING_LENGTH = 4_096;
const MAX_ERROR_STACK_LENGTH = 32_000;

const MAX_METADATA_DEPTH = 5;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 100;

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'setcookie',

  'password',
  'passwd',

  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',

  'apikey',
  'xapikey',

  'secret',
  'clientsecret',

  'session',
  'sessionid',

  'csrf',
  'csrftoken',
  'xsrf',
  'xsrftoken',

  'otp',
  'totp',
]);

@Injectable()
export class AppLogger extends Logger {
  constructor(private readonly auditLogsService: AuditLogsService) {
    super(AppLogger.name);
  }

  logRequest(
    method: string,
    path: string,
    durationMs: number,
    metadata: RequestAuditLogMetadata = {},
  ): void {
    const normalizedMethod =
      this.toNullableString(method, 16)?.toUpperCase() ?? 'UNKNOWN';

    const normalizedPath = this.normalizePath(path);

    const statusCode = this.toStatusCode(metadata.statusCode);

    const normalizedDuration = this.toNonNegativeInteger(durationMs) ?? 0;

    const { metadata: safeMetadata, device } = this.prepareMetadata(metadata);

    const level = this.getHttpAuditLogLevel(statusCode);

    const consolePayload = {
      event: 'http_request',
      method: normalizedMethod,
      path: normalizedPath,
      statusCode,
      durationMs: normalizedDuration,
      ...safeMetadata,
    };

    switch (level) {
      case AuditLogLevel.ERROR:
        super.error(consolePayload);
        break;

      case AuditLogLevel.WARN:
        super.warn(consolePayload);
        break;

      default:
        super.log(consolePayload);
        break;
    }

    this.persist({
      level,

      category: 'http_request',

      message: `${normalizedMethod} ${normalizedPath}`,

      method: normalizedMethod,
      url: normalizedPath,

      durationMs: normalizedDuration,
      statusCode,

      requestId: this.toNullableString(metadata.requestId, 100),

      traceId: this.toNullableString(metadata.traceId, 100),

      userId: this.toNullableString(metadata.userId, 100),

      ipAddress: this.toNullableString(metadata.ipAddress, 64),

      userAgent: this.toNullableString(metadata.userAgent, 2_048),

      device,

      metadata: safeMetadata,
    });
  }

  /**
   * Request-start logging is useful during debugging, but persisting
   * both start and completion records doubles HTTP logging volume.
   *
   * Therefore request-start events are debug-only.
   */
  logRequestStart(metadata: RequestAuditLogMetadata = {}): void {
    const { metadata: safeMetadata } = this.prepareMetadata(metadata);

    super.debug({
      event: 'http_request_start',
      ...safeMetadata,
    });
  }

  logError(
    message: string,
    metadata: AuditLogMetadata = {},
    error?: unknown,
  ): void {
    const safeMessage = this.normalizeMessage(message);

    const { metadata: safeMetadata, device } = this.prepareMetadata(metadata);

    const errorName =
      error instanceof Error ? this.truncate(error.name, 255) : null;

    const errorMessage = this.getErrorMessage(error);

    const errorStack =
      error instanceof Error && error.stack
        ? this.truncate(error.stack, MAX_ERROR_STACK_LENGTH)
        : null;

    if (errorMessage) {
      safeMetadata.errorMessage = errorMessage;
    }

    super.error(
      {
        event: 'application_error',
        message: safeMessage,
        errorName,
        ...safeMetadata,
      },
      errorStack ?? undefined,
    );

    this.persist({
      level: AuditLogLevel.ERROR,

      category: 'application_error',

      message: safeMessage,

      method: this.toNullableString(metadata.method, 16)?.toUpperCase(),

      url: this.normalizeNullablePath(metadata.path),

      requestId: this.toNullableString(metadata.requestId, 100),

      traceId: this.toNullableString(metadata.traceId, 100),

      userId: this.toNullableString(metadata.userId, 100),

      statusCode: this.toStatusCode(metadata.statusCode),

      ipAddress: this.toNullableString(metadata.ipAddress, 64),

      userAgent: this.toNullableString(metadata.userAgent, 2_048),

      device,

      errorName,
      errorStack,

      metadata: safeMetadata,
    });
  }

  logWarning(
    message: string,
    metadata: AuditLogMetadata = {},
    error?: unknown,
  ): void {
    const safeMessage = this.normalizeMessage(message);

    const { metadata: safeMetadata, device } = this.prepareMetadata(metadata);

    const errorName =
      error instanceof Error ? this.truncate(error.name, 255) : null;

    const errorMessage = this.getErrorMessage(error);

    const errorStack =
      error instanceof Error && error.stack
        ? this.truncate(error.stack, MAX_ERROR_STACK_LENGTH)
        : null;

    if (errorMessage) {
      safeMetadata.errorMessage = errorMessage;
    }

    super.warn({
      event: 'application_warning',
      message: safeMessage,
      errorName,
      ...safeMetadata,
    });

    this.persist({
      level: AuditLogLevel.WARN,

      category: 'application_warning',

      message: safeMessage,

      method: this.toNullableString(metadata.method, 16)?.toUpperCase(),

      url: this.normalizeNullablePath(metadata.path),

      requestId: this.toNullableString(metadata.requestId, 100),

      traceId: this.toNullableString(metadata.traceId, 100),

      userId: this.toNullableString(metadata.userId, 100),

      statusCode: this.toStatusCode(metadata.statusCode),

      ipAddress: this.toNullableString(metadata.ipAddress, 64),

      userAgent: this.toNullableString(metadata.userAgent, 2_048),

      device,

      errorName,
      errorStack,

      metadata: safeMetadata,
    });
  }

  logAudit(message: string, metadata: AuditLogMetadata = {}): void {
    const safeMessage = this.normalizeMessage(message);

    const { metadata: safeMetadata, device } = this.prepareMetadata(metadata);

    super.log({
      event: 'audit',
      message: safeMessage,
      ...safeMetadata,
    });

    this.persist({
      level: AuditLogLevel.INFO,

      category: 'audit',

      message: safeMessage,

      requestId: this.toNullableString(metadata.requestId, 100),

      traceId: this.toNullableString(metadata.traceId, 100),

      userId: this.toNullableString(metadata.userId, 100),

      ipAddress: this.toNullableString(metadata.ipAddress, 64),

      userAgent: this.toNullableString(metadata.userAgent, 2_048),

      device,

      metadata: safeMetadata,
    });
  }

  private persist(input: RecordAuditLogInput): void {
    /*
     * Application logging must never cause the user request
     * itself to fail.
     */
    void this.auditLogsService.record(input).catch((error: unknown) => {
      const persistenceError =
        error instanceof Error ? error : new Error(String(error));

      /*
       * Never use this.logError() here.
       * Doing so would recursively attempt another DB write.
       */
      super.error(
        {
          event: 'log_persistence_failure',
          message: persistenceError.message,
        },
        persistenceError.stack,
      );
    });
  }

  private prepareMetadata(metadata: AuditLogMetadata): {
    metadata: AuditLogMetadata;
    device: AuditLogDevice | null;
  } {
    const device = this.toAuditLogDevice(metadata.device);

    const safeMetadata = this.sanitizeMetadata(metadata);

    /*
     * Device has its own database column.
     * Avoid storing the same structure twice.
     */
    delete safeMetadata.device;

    return {
      metadata: safeMetadata,
      device,
    };
  }

  private sanitizeMetadata(metadata: AuditLogMetadata): AuditLogMetadata {
    const seen = new WeakSet<object>();

    const result = this.sanitizeValue(metadata, 0, seen);

    return this.isRecord(result) ? result : {};
  }

  private sanitizeValue(
    value: unknown,
    depth: number,
    seen: WeakSet<object>,
  ): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return this.truncate(value, MAX_METADATA_STRING_LENGTH);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'function' || typeof value === 'symbol') {
      return `[${typeof value}]`;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Error) {
      return {
        name: this.truncate(value.name, 255),

        message: this.truncate(value.message, MAX_METADATA_STRING_LENGTH),
      };
    }

    if (Buffer.isBuffer(value)) {
      return `[Buffer ${value.length} bytes]`;
    }

    if (typeof value !== 'object') {
      return String(value);
    }

    if (depth >= MAX_METADATA_DEPTH) {
      return '[MaxDepth]';
    }

    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => this.sanitizeValue(item, depth + 1, seen));
    }

    const result: Record<string, unknown> = {};

    const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);

    for (const [key, entryValue] of entries) {
      if (this.isSensitiveKey(key)) {
        result[key] = '[REDACTED]';
        continue;
      }

      result[key] = this.sanitizeValue(entryValue, depth + 1, seen);
    }

    return result;
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();

    return (
      SENSITIVE_KEYS.has(normalized) ||
      normalized.endsWith('password') ||
      normalized.endsWith('secret') ||
      normalized.endsWith('token')
    );
  }

  private toAuditLogDevice(value: unknown): AuditLogDevice | null {
    if (!this.isRecord(value)) {
      return null;
    }

    const device: AuditLogDevice = {};

    const deviceId = this.toNullableString(value.deviceId, 255);

    const deviceType = this.toNullableString(value.deviceType, 100);

    const os = this.toNullableString(value.os, 255);

    const browser = this.toNullableString(value.browser, 255);

    if (deviceId) {
      device.deviceId = deviceId;
    }

    if (deviceType) {
      device.deviceType = deviceType;
    }

    if (os) {
      device.os = os;
    }

    if (browser) {
      device.browser = browser;
    }

    return Object.keys(device).length > 0 ? device : null;
  }

  private getHttpAuditLogLevel(statusCode: number | null): AuditLogLevel {
    if (statusCode !== null && statusCode >= 500) {
      return AuditLogLevel.ERROR;
    }

    if (statusCode !== null && statusCode >= 400) {
      return AuditLogLevel.WARN;
    }

    return AuditLogLevel.INFO;
  }

  private getErrorMessage(error: unknown): string | null {
    if (error instanceof Error) {
      return this.truncate(error.message, MAX_METADATA_STRING_LENGTH);
    }

    if (error !== undefined && error !== null) {
      return this.truncate(String(error), MAX_METADATA_STRING_LENGTH);
    }

    return null;
  }

  private normalizeMessage(message: string): string {
    const normalized = message.trim() || 'Application log event';

    return this.truncate(normalized, MAX_LOG_MESSAGE_LENGTH);
  }

  private normalizeNullablePath(value: unknown): string | null {
    const path = this.toNullableString(value, 4_096);

    return path ? this.normalizePath(path) : null;
  }

  private normalizePath(path: string): string {
    const normalized = path.split(/[?#]/, 1)[0] || '/';

    return this.truncate(normalized, 4_096);
  }

  private toNullableString(
    value: unknown,
    maxLength = MAX_METADATA_STRING_LENGTH,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    return this.truncate(normalized, maxLength);
  }

  private toStatusCode(value: unknown): number | null {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 100 ||
      value > 599
    ) {
      return null;
    }

    return value;
  }

  private toNonNegativeInteger(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return null;
    }

    return Math.round(value);
  }

  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
