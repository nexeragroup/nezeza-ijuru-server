import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import {
  OutboxEvent,
  OutboxStatus,
} from '../../database/events/outbox-event.entity';

import { QueueService } from './queue.service';

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);

  private timer?: NodeJS.Timeout;

  private activeRun?: Promise<void>;

  private stopping = false;

  constructor(
    private readonly config: ConfigService,

    private readonly dataSource: DataSource,

    private readonly queues: QueueService,
  ) {}

  onModuleInit(): void {
    const role = this.config.get<string>('app.role', 'all');

    const enabled = this.config.get<boolean>('outbox.enabled', true);

    if (!enabled || role === 'api') {
      return;
    }

    /*
     * Validate configuration during startup rather
     * than when the first event happens.
     */
    this.getPollInterval();
    this.getBatchSize();
    this.getLeaseDuration();
    this.getMaxAttempts();
    this.getConcurrency();

    this.scheduleNext(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    if (this.timer) {
      clearTimeout(this.timer);

      this.timer = undefined;
    }

    if (this.activeRun) {
      await this.activeRun;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopping) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;

      this.activeRun = this.runCycle();

      void this.activeRun.finally(() => {
        this.activeRun = undefined;

        if (!this.stopping) {
          this.scheduleNext(this.getPollInterval());
        }
      });
    }, delayMs);
  }

  private async runCycle(): Promise<void> {
    try {
      const events = await this.claimBatch();

      if (!events.length) {
        return;
      }

      await this.publishBatch(events);
    } catch (error) {
      this.logger.error(
        `Outbox dispatch cycle failed: ${this.getErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async claimBatch(): Promise<OutboxEvent[]> {
    const now = new Date();

    const leaseExpiresAt = new Date(now.getTime() + this.getLeaseDuration());

    return this.dataSource.transaction(async (manager) => {
      const events = await manager
        .getRepository(OutboxEvent)
        .createQueryBuilder('event')
        .where(
          `
                (
                  event.status = :pending
                  OR
                  (
                    event.status = :processing
                    AND
                    (
                      event.leaseExpiresAt IS NULL
                      OR
                      event.leaseExpiresAt < :now
                    )
                  )
                )
              `,
          {
            pending: OutboxStatus.PENDING,

            processing: OutboxStatus.PROCESSING,

            now,
          },
        )
        .andWhere('event.availableAt <= :now', {
          now,
        })
        .orderBy('event.createdAt', 'ASC')
        .addOrderBy('event.eventId', 'ASC')
        .take(this.getBatchSize())
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      if (!events.length) {
        return [];
      }

      for (const event of events) {
        event.status = OutboxStatus.PROCESSING;

        event.claimToken = randomUUID();

        event.leaseExpiresAt = leaseExpiresAt;

        event.attempts += 1;
      }

      await manager.save(OutboxEvent, events);

      return events;
    });
  }

  private async publishBatch(events: OutboxEvent[]): Promise<void> {
    let index = 0;

    const concurrency = Math.min(this.getConcurrency(), events.length);

    const workers = Array.from(
      {
        length: concurrency,
      },

      async () => {
        while (true) {
          const currentIndex = index++;

          const event = events[currentIndex];

          if (!event) {
            return;
          }

          await this.publish(event);
        }
      },
    );

    await Promise.all(workers);
  }

  private async publish(event: OutboxEvent): Promise<void> {
    const claimToken = event.claimToken;

    if (!claimToken) {
      this.logger.warn(`Outbox event ${event.eventId} has no claim token`);

      return;
    }

    /*
     * Refresh the lease immediately before publishing.
     *
     * This protects events that spent time waiting behind
     * earlier items in the claimed batch.
     */
    const ownsClaim = await this.renewLease(event.eventId, claimToken);

    if (!ownsClaim) {
      this.logger.warn(
        `Outbox claim was lost before publishing event ${event.eventId}`,
      );

      return;
    }

    try {
      await this.queues.publish({
        eventId: event.eventId,

        eventType: event.eventType,

        schemaVersion: event.schemaVersion,

        aggregateType: event.aggregateType ?? undefined,

        aggregateId: event.aggregateId ?? undefined,

        payload: event.payload,

        headers: event.headers,
      });

      const result = await this.dataSource.getRepository(OutboxEvent).update(
        {
          eventId: event.eventId,

          claimToken,

          status: OutboxStatus.PROCESSING,
        },

        {
          status: OutboxStatus.PUBLISHED,

          publishedAt: new Date(),

          claimToken: null,

          leaseExpiresAt: null,

          lastError: null,
        },
      );

      if (result.affected !== 1) {
        this.logger.warn(
          `Outbox event ${event.eventId} was published but its claim could not be finalized`,
        );
      }
    } catch (error) {
      await this.handlePublishFailure(event, claimToken, error);
    }
  }

  private async renewLease(
    eventId: string,
    claimToken: string,
  ): Promise<boolean> {
    const leaseExpiresAt = new Date(Date.now() + this.getLeaseDuration());

    const result = await this.dataSource.getRepository(OutboxEvent).update(
      {
        eventId,

        claimToken,

        status: OutboxStatus.PROCESSING,
      },

      {
        leaseExpiresAt,
      },
    );

    return result.affected === 1;
  }

  private async handlePublishFailure(
    event: OutboxEvent,
    claimToken: string,
    error: unknown,
  ): Promise<void> {
    const maxAttempts = this.getMaxAttempts();

    const exhausted = event.attempts >= maxAttempts;

    const message = this.getErrorMessage(error).slice(0, 2_000);

    const nextAvailableAt = exhausted
      ? event.availableAt
      : new Date(Date.now() + this.getBackoffDelay(event.attempts));

    const result = await this.dataSource.getRepository(OutboxEvent).update(
      {
        eventId: event.eventId,

        claimToken,

        status: OutboxStatus.PROCESSING,
      },

      {
        status: exhausted ? OutboxStatus.FAILED : OutboxStatus.PENDING,

        availableAt: nextAvailableAt,

        claimToken: null,

        leaseExpiresAt: null,

        lastError: message,
      },
    );

    if (result.affected !== 1) {
      this.logger.warn(
        `Unable to update failed outbox event ${event.eventId}; claim may have been lost`,
      );

      return;
    }

    if (exhausted) {
      this.logger.error(
        `Outbox event ${event.eventId} permanently failed after ${event.attempts} attempts: ${message}`,
      );
    } else {
      this.logger.warn(
        `Outbox event ${event.eventId} failed on attempt ${event.attempts}; retry scheduled: ${message}`,
      );
    }
  }

  private getBackoffDelay(attempt: number): number {
    const baseDelay = this.getPositiveInteger('outbox.retryBaseDelayMs', 1_000);

    const maxDelay = this.getPositiveInteger('outbox.retryMaxDelayMs', 60_000);

    const exponential = Math.min(
      baseDelay * 2 ** Math.min(Math.max(attempt - 1, 0), 16),

      maxDelay,
    );

    /*
     * Add up to 20% jitter so multiple workers do not
     * retry failed infrastructure at exactly the same
     * instant.
     */
    const jitter = Math.floor(Math.random() * Math.max(1, exponential * 0.2));

    return Math.min(exponential + jitter, maxDelay);
  }

  private getPollInterval(): number {
    return this.getPositiveInteger('outbox.pollIntervalMs', 1_000);
  }

  private getBatchSize(): number {
    return this.getPositiveInteger('outbox.batchSize', 50, 1_000);
  }

  private getLeaseDuration(): number {
    return this.getPositiveInteger('outbox.leaseDurationMs', 30_000);
  }

  private getMaxAttempts(): number {
    return this.getPositiveInteger('outbox.maxAttempts', 10, 100);
  }

  private getConcurrency(): number {
    return this.getPositiveInteger('outbox.publishConcurrency', 5, 100);
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

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
