import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { Job, Queue, UnrecoverableError, Worker } from 'bullmq';

import { DeadLetterService } from './dead-letter.service';

import { IdempotencyService } from './idempotency.service';

import {
  MailTransportService,
  type MailMessage,
} from './mail-transport.service';

import { RedisService } from './redis.service';

import { RetryPolicyService } from './retry-policy.service';

import { SecretProtectionService } from './secret-protection.service';

import { InfrastructureEvent } from '../models/event.model';

class UnsupportedEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedEventError';
  }
}

class InvalidEventPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEventPayloadError';
  }
}

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);

  private worker?: Worker<InfrastructureEvent>;

  constructor(
    private readonly config: ConfigService,

    private readonly redis: RedisService,

    private readonly retry: RetryPolicyService,

    private readonly deadLetters: DeadLetterService,

    private readonly mail: MailTransportService,

    private readonly secrets: SecretProtectionService,

    private readonly idempotency: IdempotencyService,
  ) {}

  async onModuleInit(): Promise<void> {
    const role = this.config.get<string>('app.role', 'all');

    const enabled = this.config.get<boolean>('queue.enabled', true);

    if (!enabled || role === 'api') {
      return;
    }

    const concurrency = this.getPositiveInteger('queue.concurrency', 5, 1_000);

    /*
     * Recover failures which may have happened while
     * this worker process was offline.
     */
    await this.reconcileTerminalFailures();

    this.worker = new Worker<InfrastructureEvent>(
      this.getQueueName(),

      async (job) => this.processSafely(job),

      {
        connection: this.redis.getBullConnection('worker'),

        prefix: this.getQueuePrefix(),

        concurrency,

        maxStalledCount: this.getPositiveInteger(
          'queue.maxStalledCount',
          1,
          100,
        ),

        lockDuration: this.getPositiveInteger('queue.lockDurationMs', 30_000),
      },
    );

    this.registerWorkerEvents();

    await this.worker.waitUntilReady();

    this.logger.log(`Worker started with concurrency ${concurrency}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.worker) {
      return;
    }

    this.logger.log('Stopping queue worker');

    /*
     * worker.close() stops taking new jobs and waits
     * for currently executing jobs to finish.
     */
    await this.worker.close();

    this.worker = undefined;

    this.logger.log('Queue worker stopped');
  }

  private async processSafely(job: Job<InfrastructureEvent>): Promise<void> {
    try {
      await this.process(job);
    } catch (error) {
      throw this.retry.toWorkerError(error);
    }
  }

  private async process(job: Job<InfrastructureEvent>): Promise<void> {
    const event = this.validateEvent(job.data);

    switch (event.eventType) {
      case 'mail.send':
        await this.processMailEvent(event);

        return;

      default:
        throw new UnsupportedEventError(
          `Unsupported event type "${event.eventType}"`,
        );
    }
  }

  private async processMailEvent(event: InfrastructureEvent): Promise<void> {
    if (event.schemaVersion !== 1) {
      throw new UnsupportedEventError(
        `Unsupported mail.send schema version ${event.schemaVersion}`,
      );
    }

    const payload = this.asRecord(event.payload);

    if (typeof payload.encrypted !== 'string') {
      throw new InvalidEventPayloadError(
        'mail.send payload must contain an encrypted value',
      );
    }

    const decrypted = this.decryptPayload(payload.encrypted);

    const message = this.parseMailMessage(decrypted);

    await this.idempotency.processOnce(
      'mail.send.v1',
      event.eventId,

      async () => {
        /*
         * eventId MUST be propagated to MailTransportService
         * as the provider/integration idempotency key whenever
         * the transport supports one.
         *
         * A database transaction alone cannot make an external
         * email provider exactly-once.
         */
        await this.mail.deliver(message, event.eventId);
      },
    );
  }

  private validateEvent(value: InfrastructureEvent): InfrastructureEvent {
    if (!value || typeof value !== 'object') {
      throw new InvalidEventPayloadError('Event payload is missing');
    }

    if (typeof value.eventId !== 'string' || !value.eventId.trim()) {
      throw new InvalidEventPayloadError('eventId is required');
    }

    if (typeof value.eventType !== 'string' || !value.eventType.trim()) {
      throw new InvalidEventPayloadError('eventType is required');
    }

    if (
      !Number.isSafeInteger(value.schemaVersion) ||
      value.schemaVersion <= 0
    ) {
      throw new InvalidEventPayloadError(
        'schemaVersion must be a positive integer',
      );
    }

    return value;
  }

  private decryptPayload(encrypted: string): string {
    try {
      return this.secrets.decrypt(encrypted);
    } catch {
      throw new InvalidEventPayloadError(
        'Encrypted mail payload could not be decrypted',
      );
    }
  }

  private parseMailMessage(serialized: string): MailMessage {
    let parsed: unknown;

    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new InvalidEventPayloadError('Mail payload is not valid JSON');
    }

    const value = this.asRecord(parsed);

    if (
      typeof value.to !== 'string' ||
      !value.to.trim() ||
      typeof value.subject !== 'string' ||
      !value.subject.trim() ||
      typeof value.text !== 'string' ||
      !value.text.trim()
    ) {
      throw new InvalidEventPayloadError('Mail payload is invalid');
    }

    return parsed as MailMessage;
  }

  private registerWorkerEvents(): void {
    if (!this.worker) {
      return;
    }

    this.worker.on('completed', (job) => {
      this.logger.debug(`Job ${job.id ?? 'unknown'} completed`);
    });

    this.worker.on('failed', (job, error) => {
      if (!job) {
        this.logger.error(
          `Worker failure without job context: ${error.message}`,
          error.stack,
        );

        return;
      }

      this.logger.warn(
        `Job ${job.id ?? 'unknown'} failed on attempt ${job.attemptsMade}: ${error.message}`,
      );

      if (this.isTerminalFailure(job, error)) {
        void this.capture(job, error).catch((captureError) => {
          this.logger.error(
            `Failed to persist terminal failure for job ${job.id ?? 'unknown'}: ${this.getErrorMessage(captureError)}`,
          );
        });
      }
    });

    this.worker.on('error', (error) => {
      this.logger.error(
        `Worker infrastructure error: ${error.message}`,
        error.stack,
      );
    });

    this.worker.on('stalled', (jobId) => {
      this.logger.warn(`Job ${jobId} stalled`);
    });
  }

  private isTerminalFailure(
    job: Job<InfrastructureEvent>,
    error: Error,
  ): boolean {
    if (
      error instanceof UnrecoverableError ||
      error.message.startsWith('PERMANENT:')
    ) {
      return true;
    }

    const configuredAttempts = job.opts.attempts ?? 1;

    return job.attemptsMade >= configuredAttempts;
  }

  private async capture(
    job: Job<InfrastructureEvent>,
    error: Error,
  ): Promise<void> {
    const data = job.data ?? ({} as InfrastructureEvent);

    await this.deadLetters.capture({
      deadLetterId: `dlq:${String(job.id ?? data.eventId ?? 'unknown')}`,

      queueName: job.queueName,

      jobId: String(job.id ?? ''),

      eventId:
        typeof data.eventId === 'string'
          ? data.eventId
          : String(job.id ?? 'unknown'),

      eventType:
        typeof data.eventType === 'string' ? data.eventType : 'unknown',

      schemaVersion: Number.isSafeInteger(data.schemaVersion)
        ? data.schemaVersion
        : 1,

      payload: this.isRecord(data.payload) ? data.payload : {},

      headers: this.isStringRecord(data.headers) ? data.headers : {},

      attempts: job.attemptsMade,

      errorName: error.name,

      errorMessage: error.message.slice(0, 2_000),

      failedAt: new Date(),

      replayedAt: null,
    });
  }

  private async reconcileTerminalFailures(): Promise<void> {
    const queue = new Queue<InfrastructureEvent>(this.getQueueName(), {
      connection: this.redis.getBullConnection('producer'),

      prefix: this.getQueuePrefix(),
    });

    try {
      await queue.waitUntilReady();

      const limit = this.getPositiveInteger(
        'queue.failureReconcileLimit',
        1_000,
        10_000,
      );

      const jobs = await queue.getFailed(0, limit - 1);

      for (const job of jobs) {
        const attempts = job.opts.attempts ?? 1;

        const failedReason = job.failedReason ?? 'Terminal job failure';

        const permanent = failedReason.startsWith('PERMANENT:');

        const exhausted = job.attemptsMade >= attempts;

        if (!permanent && !exhausted) {
          continue;
        }

        await this.capture(
          job,

          permanent
            ? new UnrecoverableError(failedReason)
            : new Error(failedReason),
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to reconcile terminal queue failures: ${this.getErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      await queue.close();
    }
  }

  private getQueueName(): string {
    const name = this.config
      .get<string>('queue.eventQueueName', 'events.v1')
      .trim();

    if (!name) {
      throw new Error('queue.eventQueueName cannot be empty');
    }

    return name;
  }

  private getQueuePrefix(): string {
    const prefix = this.config
      .get<string>('queue.prefix', 'centralized-api')
      .trim();

    if (!prefix) {
      throw new Error('queue.prefix cannot be empty');
    }

    return prefix;
  }

  private getPositiveInteger(
    key: string,
    fallback: number,
    maximum = Number.MAX_SAFE_INTEGER,
  ): number {
    const value = this.config.get<number>(key, fallback);

    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
      throw new Error(
        `${key} must be a positive integer no greater than ${maximum}`,
      );
    }

    return value;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!this.isRecord(value)) {
      throw new InvalidEventPayloadError('Expected an object payload');
    }

    return value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isStringRecord(value: unknown): value is Record<string, string> {
    if (!this.isRecord(value)) {
      return false;
    }

    return Object.values(value).every((entry) => typeof entry === 'string');
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
