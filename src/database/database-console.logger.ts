import { Logger as NestLogger } from '@nestjs/common';

import type { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';

export interface DatabaseConsoleLoggerOptions {
  readonly maxQueryLength?: number;
}

const DEFAULT_MAX_QUERY_LENGTH = 8_192;

export class DatabaseConsoleLogger implements TypeOrmLogger {
  private readonly logger = new NestLogger('Database');

  private readonly maxQueryLength: number;

  constructor(options: DatabaseConsoleLoggerOptions = {}) {
    this.maxQueryLength = options.maxQueryLength ?? DEFAULT_MAX_QUERY_LENGTH;
  }

  logQuery(
    query: string,
    parameters?: unknown[],
    queryRunner?: QueryRunner,
  ): void {
    this.logger.debug(this.formatQuery(query, parameters, queryRunner));
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
    queryRunner?: QueryRunner,
  ): void {
    const errorMessage = error instanceof Error ? error.message : error;

    this.logger.error(
      [
        this.formatQuery(query, parameters, queryRunner),

        `error=${this.truncate(errorMessage, 2_000)}`,
      ].join(' | '),
    );
  }

  logQuerySlow(
    time: number,
    query: string,
    parameters?: unknown[],
    queryRunner?: QueryRunner,
  ): void {
    this.logger.warn(
      [
        `Slow query (${Math.round(time)} ms)`,

        this.formatQuery(query, parameters, queryRunner),
      ].join(': '),
    );
  }

  logSchemaBuild(message: string, _queryRunner?: QueryRunner): void {
    this.logger.log(`[Schema] ${this.truncate(message, 4_096)}`);
  }

  logMigration(message: string, _queryRunner?: QueryRunner): void {
    this.logger.log(`[Migration] ${this.truncate(message, 4_096)}`);
  }

  log(
    level: 'log' | 'info' | 'warn',
    message: unknown,
    _queryRunner?: QueryRunner,
  ): void {
    const formatted = `[TypeORM] ${this.truncate(String(message), 4_096)}`;

    if (level === 'warn') {
      this.logger.warn(formatted);

      return;
    }

    if (level === 'info') {
      this.logger.debug(formatted);

      return;
    }

    this.logger.log(formatted);
  }

  private formatQuery(
    query: string,
    parameters?: unknown[],
    queryRunner?: QueryRunner,
  ): string {
    const normalizedQuery = this.normalizeQuery(query);

    const context = this.getQueryContext(queryRunner);

    const parameterCount = parameters?.length ?? 0;

    return [
      `[SQL] ${normalizedQuery}`,

      `params=${parameterCount}`,

      context.requestId ? `requestId=${context.requestId}` : null,

      context.traceId ? `traceId=${context.traceId}` : null,
    ]
      .filter(Boolean)
      .join(' | ');
  }

  private getQueryContext(queryRunner?: QueryRunner): {
    requestId: string | null;
    traceId: string | null;
  } {
    const data = queryRunner?.data;

    if (!data || typeof data !== 'object') {
      return {
        requestId: null,
        traceId: null,
      };
    }

    return {
      requestId: this.toNullableString(data.requestId),

      traceId: this.toNullableString(data.traceId),
    };
  }

  private normalizeQuery(query: string): string {
    const normalized = query.replace(/\s+/g, ' ').trim();

    return this.truncate(normalized, this.maxQueryLength);
  }

  private truncate(value: string, maximum: number): string {
    return value.length > maximum ? `${value.slice(0, maximum)}…` : value;
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();

    return normalized || null;
  }
}
