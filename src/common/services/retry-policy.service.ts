import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type JobsOptions, UnrecoverableError } from 'bullmq';

const DEFAULT_ATTEMPTS = 5;
const DEFAULT_BACKOFF_DELAY_MS = 1_000;
const DEFAULT_BACKOFF_JITTER = 0.2;
const DEFAULT_STACK_TRACE_LIMIT = 20;

const PERMANENT_ERROR_NAMES = new Set([
  'PermanentJobError',
  'UnsupportedEventError',
  'InvalidEventPayloadError',
  'ValidationError',
]);

export type RetryJobOptions = Pick<
  JobsOptions,
  'attempts' | 'backoff' | 'stackTraceLimit'
>;

@Injectable()
export class RetryPolicyService {
  private readonly attempts: number;
  private readonly backoffDelayMs: number;
  private readonly backoffJitter: number;
  private readonly stackTraceLimit: number;

  constructor(private readonly config: ConfigService) {
    this.attempts = this.config.get<number>('queue.attempts', DEFAULT_ATTEMPTS);

    this.backoffDelayMs = this.config.get<number>(
      'queue.backoffDelayMs',
      DEFAULT_BACKOFF_DELAY_MS,
    );

    this.backoffJitter = this.config.get<number>(
      'queue.backoffJitter',
      DEFAULT_BACKOFF_JITTER,
    );

    this.stackTraceLimit = this.config.get<number>(
      'queue.stackTraceLimit',
      DEFAULT_STACK_TRACE_LIMIT,
    );

    this.validateConfiguration();
  }

  options(): RetryJobOptions {
    return {
      attempts: this.attempts,

      backoff: {
        type: 'exponential',
        delay: this.backoffDelayMs,
        jitter: this.backoffJitter,
      },

      stackTraceLimit: this.stackTraceLimit,
    };
  }

  isPermanent(error: unknown): boolean {
    return error instanceof Error && PERMANENT_ERROR_NAMES.has(error.name);
  }

  /**
   * Converts application errors into the error BullMQ
   * should receive.
   *
   * Permanent failures bypass all remaining retries.
   */
  toWorkerError(error: unknown): Error {
    const normalized = this.normalizeError(error);

    if (!this.isPermanent(normalized)) {
      return normalized;
    }

    return new UnrecoverableError(
      `PERMANENT:${normalized.name}:${normalized.message}`,
    );
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    if (typeof error === 'string') {
      return new Error(error);
    }

    return new Error('Unknown worker processing failure');
  }

  private validateConfiguration(): void {
    this.assertPositiveInteger(this.attempts, 'queue.attempts', 100);

    this.assertPositiveInteger(
      this.backoffDelayMs,
      'queue.backoffDelayMs',
      86_400_000,
    );

    this.assertPositiveInteger(
      this.stackTraceLimit,
      'queue.stackTraceLimit',
      1_000,
    );

    if (
      !Number.isFinite(this.backoffJitter) ||
      this.backoffJitter < 0 ||
      this.backoffJitter > 1
    ) {
      throw new Error('queue.backoffJitter must be between 0 and 1');
    }
  }

  private assertPositiveInteger(
    value: number,
    name: string,
    maximum: number,
  ): void {
    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
      throw new Error(
        `${name} must be a positive integer no greater than ${maximum}`,
      );
    }
  }
}
