import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, QueryFailedError, Repository } from 'typeorm';

import { DeadLetterEvent } from '../../database/events/dead-letter-event.entity';

import { QueueService } from './queue.service';

export interface CaptureDeadLetterInput {
  readonly deadLetterId: string;

  readonly queueName: string;
  readonly jobId: string;

  readonly eventId: string;
  readonly eventType: string;
  readonly schemaVersion: number;

  readonly payload: Record<string, unknown>;

  readonly headers: Record<string, string>;

  readonly attempts: number;

  readonly errorName: string;
  readonly errorMessage: string;

  readonly failedAt: Date;

  readonly replayedAt: Date | null;
}

@Injectable()
export class DeadLetterService {
  constructor(
    @InjectRepository(DeadLetterEvent)
    private readonly repository: Repository<DeadLetterEvent>,

    private readonly dataSource: DataSource,

    private readonly queues: QueueService,
  ) {}

  async capture(input: CaptureDeadLetterInput): Promise<DeadLetterEvent> {
    this.validateInput(input);

    let record: DeadLetterEvent;

    try {
      /*
       * repository.create/save avoids TypeORM's
       * QueryDeepPartialEntity JSON typing problem.
       *
       * The UNIQUE constraint on deadLetterId provides
       * the actual concurrency guarantee.
       */
      const entity = this.repository.create({
        deadLetterId: input.deadLetterId,

        queueName: input.queueName,

        jobId: input.jobId,

        eventId: input.eventId,

        eventType: input.eventType,

        schemaVersion: input.schemaVersion,

        payload: input.payload,

        headers: input.headers,

        attempts: input.attempts,

        errorName: input.errorName,

        errorMessage: input.errorMessage,

        failedAt: input.failedAt,

        replayedAt: input.replayedAt,
      });

      record = await this.repository.save(entity);
    } catch (error) {
      /*
       * PostgreSQL UNIQUE_VIOLATION.
       *
       * Another application instance may have inserted
       * the same dead-letter event concurrently.
       */
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const existing = await this.repository.findOneBy({
        deadLetterId: input.deadLetterId,
      });

      if (!existing) {
        throw error;
      }

      record = existing;
    }

    /*
     * captureDeadLetter() itself must be idempotent.
     *
     * QueueService uses a deterministic BullMQ job ID,
     * so calling it again also repairs situations where
     * PostgreSQL previously succeeded but Redis failed.
     */
    await this.queues.captureDeadLetter({
      eventId: record.eventId,

      deadLetterId: record.deadLetterId,

      eventType: record.eventType,
    });

    return record;
  }

  async replay(deadLetterId: string): Promise<void> {
    this.assertIdentifier(deadLetterId, 'deadLetterId');

    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(DeadLetterEvent);

      const record = await repository
        .createQueryBuilder('deadLetter')
        .setLock('pessimistic_write')
        .where('deadLetter.deadLetterId = :deadLetterId', {
          deadLetterId,
        })
        .getOne();

      if (!record) {
        throw new NotFoundException({
          code: 'DEAD_LETTER_NOT_FOUND',

          message: 'Dead-letter event was not found',
        });
      }

      if (record.replayedAt) {
        throw new ConflictException({
          code: 'DEAD_LETTER_ALREADY_REPLAYED',

          message: 'Dead-letter event has already been replayed',
        });
      }

      await this.queues.publish({
        eventId: record.eventId,

        eventType: record.eventType,

        schemaVersion: record.schemaVersion,

        payload: record.payload,

        headers: record.headers,
      });

      record.replayedAt = new Date();

      await repository.save(record);
    });
  }

  private validateInput(input: CaptureDeadLetterInput): void {
    this.assertIdentifier(input.deadLetterId, 'deadLetterId');

    this.assertIdentifier(input.eventId, 'eventId');

    this.assertIdentifier(input.eventType, 'eventType');

    this.assertIdentifier(input.queueName, 'queueName');

    this.assertIdentifier(input.jobId, 'jobId');

    if (
      !Number.isSafeInteger(input.schemaVersion) ||
      input.schemaVersion <= 0
    ) {
      throw new TypeError('schemaVersion must be a positive integer');
    }

    if (!Number.isSafeInteger(input.attempts) || input.attempts < 0) {
      throw new TypeError('attempts must be a non-negative integer');
    }
  }

  private assertIdentifier(value: string, name: string): void {
    if (typeof value !== 'string' || !value.trim() || value.length > 255) {
      throw new TypeError(
        `${name} must be a non-empty string of at most 255 characters`,
      );
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as {
      code?: unknown;
    };

    /*
     * PostgreSQL SQLSTATE:
     * 23505 = unique_violation
     */
    return driverError?.code === '23505';
  }
}
