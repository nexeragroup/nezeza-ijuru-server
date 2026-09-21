import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, LessThan, Repository } from 'typeorm';

import {
  AuditLogDevice,
  AuditLogLevel,
  AuditLogEntity,
} from './entity/audit-log.entity';

const DEFAULT_AUDIT_LOG_LIMIT = 100;
const MAX_AUDIT_LOG_LIMIT = 500;

export interface RecordAuditLogInput {
  level?: AuditLogLevel;
  category?: string;
  message: string;
  method?: string | null;
  url?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  requestId?: string | null;
  traceId?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  device?: AuditLogDevice | null;
  errorName?: string | null;
  errorStack?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ListAuditLogsInput {
  limit?: number;
  level?: AuditLogLevel;
  category?: string;
  requestId?: string;
  traceId?: string;
  userId?: string;
  before?: Date;
}

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repository: Repository<AuditLogEntity>,
  ) {}

  list(input: ListAuditLogsInput = {}): Promise<AuditLogEntity[]> {
    const limit = this.normalizeLimit(input.limit);

    const where: FindOptionsWhere<AuditLogEntity> = {};

    if (input.level) {
      where.level = input.level;
    }

    if (input.category) {
      where.category = input.category;
    }

    if (input.requestId) {
      where.requestId = input.requestId;
    }

    if (input.traceId) {
      where.traceId = input.traceId;
    }

    if (input.userId) {
      where.userId = input.userId;
    }

    if (input.before instanceof Date && !Number.isNaN(input.before.getTime())) {
      where.createdAt = LessThan(input.before);
    }

    return this.repository.find({
      where,
      order: {
        createdAt: 'DESC',
        id: 'DESC',
      },
      take: limit,
    });
  }

  findById(id: string): Promise<AuditLogEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  async record(input: RecordAuditLogInput): Promise<void> {
    await this.repository.insert({
      level: input.level ?? AuditLogLevel.INFO,
      category: this.normalizeString(input.category, 100) ?? 'application',
      message:
        this.normalizeString(input.message, 4_096) ?? 'Application log event',
      method: this.normalizeString(input.method, 16)?.toUpperCase() ?? null,
      url: this.normalizeString(input.url, 4_096),
      statusCode: this.normalizeStatusCode(input.statusCode),
      durationMs: this.normalizeDuration(input.durationMs),
      requestId: this.normalizeString(input.requestId, 100),
      traceId: this.normalizeString(input.traceId, 100),
      userId: this.normalizeString(input.userId, 100),
      ipAddress: this.normalizeString(input.ipAddress, 64),
      userAgent: this.normalizeString(input.userAgent, 2_048),
      device: input.device ?? null,
      errorName: this.normalizeString(input.errorName, 255),
      errorStack: this.normalizeString(input.errorStack, 32_000),
    });
  }

  private normalizeLimit(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value)) {
      return DEFAULT_AUDIT_LOG_LIMIT;
    }

    return Math.min(Math.max(Math.floor(value), 1), MAX_AUDIT_LOG_LIMIT);
  }

  private normalizeStatusCode(value: number | null | undefined): number | null {
    if (
      value === null ||
      value === undefined ||
      !Number.isInteger(value) ||
      value < 100 ||
      value > 599
    ) {
      return null;
    }

    return value;
  }

  private normalizeDuration(value: number | null | undefined): number | null {
    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      return null;
    }

    return Math.round(value);
  }

  private normalizeString(
    value: string | null | undefined,
    maxLength: number,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    return normalized.length > maxLength
      ? normalized.slice(0, maxLength)
      : normalized;
  }
}
