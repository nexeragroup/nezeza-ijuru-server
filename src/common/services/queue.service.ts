import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { Job, JobsOptions, Queue } from 'bullmq';

import { createHash } from 'node:crypto';

import { InfrastructureEvent } from '../models/event.model';

import { RedisService } from './redis.service';

import { RetryPolicyService } from './retry-policy.service';

export interface DeadLetterQueuePayload {
  readonly eventId?: string;
  readonly deadLetterId?: string;
  readonly jobId?: string;

  readonly [key: string]: unknown;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);

  private eventQueue?: Queue<InfrastructureEvent>;

  private deadLetterQueue?: Queue<DeadLetterQueuePayload>;

  private enabled = false;

  constructor(
    private readonly config: ConfigService,

    private readonly redis: RedisService,

    private readonly retry: RetryPolicyService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.enabled = this.config.get<boolean>('queue.enabled', true);

    if (!this.enabled) {
      this.logger.warn('Queue infrastructure is disabled');

      return;
    }

    const connection = this.redis.getBullConnection('producer');

    const prefix = this.getRequiredName('queue.prefix', 'centralized-api');

    const eventQueueName = this.getRequiredName(
      'queue.eventQueueName',
      'events.v1',
    );

    const deadLetterQueueName = this.getRequiredName(
      'queue.deadLetterQueueName',
      'events.dlq.v1',
    );

    this.eventQueue = new Queue<InfrastructureEvent>(eventQueueName, {
      connection,
      prefix,
    });

    this.deadLetterQueue = new Queue<DeadLetterQueuePayload>(
      deadLetterQueueName,
      {
        connection,
        prefix,
      },
    );

    this.registerQueueEvents();

    /*
     * Queue infrastructure is enabled, therefore inability
     * to establish the producer connection is a startup
     * failure rather than something to silently ignore.
     */
    await Promise.all([
      this.eventQueue.waitUntilReady(),
      this.deadLetterQueue.waitUntilReady(),
    ]);

    this.logger.log('Queue infrastructure is ready');
  }

  async publish(event: InfrastructureEvent): Promise<Job<InfrastructureEvent>> {
    const queue = this.requireEventQueue();

    this.validateEvent(event);

    return queue.add(event.eventType, event, {
      ...this.retry.options(),

      /*
       * Deterministic job ID provides another layer
       * of duplicate suppression.
       */
      jobId: this.createJobId('event', event.eventId),

      ...this.getRetentionOptions(),
    });
  }

  async captureDeadLetter(
    data: DeadLetterQueuePayload,
  ): Promise<Job<DeadLetterQueuePayload>> {
    const queue = this.requireDeadLetterQueue();

    const identifier = this.getDeadLetterIdentifier(data);

    return queue.add('dead-letter', data, {
      jobId: this.createJobId('dlq', identifier),

      attempts: 1,

      /*
       * The authoritative DLQ record lives in PostgreSQL,
       * so BullMQ retention can remain bounded.
       */
      removeOnComplete: {
        age: this.config.get<number>(
          'queue.dlqCompletedRetentionSeconds',
          86_400,
        ),

        count: this.config.get<number>(
          'queue.dlqCompletedRetentionCount',
          10_000,
        ),
      },

      removeOnFail: {
        age: this.config.get<number>(
          'queue.dlqFailedRetentionSeconds',
          604_800,
        ),

        count: this.config.get<number>('queue.dlqFailedRetentionCount', 50_000),
      },
    });
  }

  getEventQueue(): Queue<InfrastructureEvent> | undefined {
    return this.eventQueue;
  }

  getDeadLetterQueue(): Queue<DeadLetterQueuePayload> | undefined {
    return this.deadLetterQueue;
  }

  isReady(): boolean {
    return !this.enabled || Boolean(this.eventQueue && this.deadLetterQueue);
  }

  async onModuleDestroy(): Promise<void> {
    const results = await Promise.allSettled([
      this.eventQueue?.close(),
      this.deadLetterQueue?.close(),
    ]);

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Queue shutdown failed: ${
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
          }`,
        );
      }
    }

    this.eventQueue = undefined;

    this.deadLetterQueue = undefined;

    this.logger.log('Queue connections closed');
  }

  private requireEventQueue(): Queue<InfrastructureEvent> {
    if (!this.eventQueue) {
      throw new ServiceUnavailableException({
        code: 'QUEUE_UNAVAILABLE',

        message: 'Queue infrastructure is unavailable',
      });
    }

    return this.eventQueue;
  }

  private requireDeadLetterQueue(): Queue<DeadLetterQueuePayload> {
    if (!this.deadLetterQueue) {
      throw new ServiceUnavailableException({
        code: 'DEAD_LETTER_QUEUE_UNAVAILABLE',

        message: 'Dead-letter queue infrastructure is unavailable',
      });
    }

    return this.deadLetterQueue;
  }

  private createJobId(prefix: string, identifier: string): string {
    const digest = createHash('sha256').update(identifier).digest('hex');

    /*
     * BullMQ IDs:
     *
     * - contain no colon
     * - are not numeric-only
     * - have predictable bounded size
     */
    return `${prefix}-${digest}`;
  }

  private getDeadLetterIdentifier(data: DeadLetterQueuePayload): string {
    const value = data.deadLetterId ?? data.eventId ?? data.jobId;

    if (typeof value !== 'string' || !value.trim()) {
      throw new TypeError(
        'Dead-letter payload must contain deadLetterId, eventId, or jobId',
      );
    }

    return value;
  }

  private validateEvent(event: InfrastructureEvent): void {
    if (!event.eventId?.trim()) {
      throw new TypeError('eventId is required');
    }

    if (!event.eventType?.trim()) {
      throw new TypeError('eventType is required');
    }

    if (
      !Number.isSafeInteger(event.schemaVersion) ||
      event.schemaVersion <= 0
    ) {
      throw new TypeError('schemaVersion must be a positive integer');
    }
  }

  private getRetentionOptions(): Pick<
    JobsOptions,
    'removeOnComplete' | 'removeOnFail'
  > {
    return {
      removeOnComplete: {
        age: this.config.get<number>('queue.completedRetentionSeconds', 86_400),

        count: this.config.get<number>('queue.completedRetentionCount', 10_000),
      },

      removeOnFail: {
        age: this.config.get<number>('queue.failedRetentionSeconds', 604_800),

        count: this.config.get<number>('queue.failedRetentionCount', 50_000),
      },
    };
  }

  private registerQueueEvents(): void {
    this.eventQueue?.on('error', (error: Error) => {
      this.logger.error(`Event queue error: ${error.message}`, error.stack);
    });

    this.deadLetterQueue?.on('error', (error: Error) => {
      this.logger.error(
        `Dead-letter queue error: ${error.message}`,
        error.stack,
      );
    });
  }

  private getRequiredName(key: string, fallback: string): string {
    const value = this.config.get<string>(key, fallback).trim();

    if (!value) {
      throw new Error(`${key} cannot be empty`);
    }

    return value;
  }
}
