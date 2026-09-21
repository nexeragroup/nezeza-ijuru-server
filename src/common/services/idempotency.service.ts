import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, EntityManager, Repository } from 'typeorm';

import { ProcessedEvent } from '../../database/events/processed-event.entity';

export type ProcessOnceResult<T> =
  | {
      readonly processed: true;
      readonly value: T;
    }
  | {
      readonly processed: false;
    };

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(ProcessedEvent)
    private readonly repository: Repository<ProcessedEvent>,

    private readonly dataSource: DataSource,
  ) {}

  async hasProcessed(
    consumerName: string,
    eventId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    this.assertIdentifier(consumerName, 'consumerName');

    this.assertIdentifier(eventId, 'eventId');

    if (manager) {
      return manager.existsBy(ProcessedEvent, {
        consumerName,
        eventId,
      });
    }

    return this.repository.existsBy({
      consumerName,
      eventId,
    });
  }

  async processOnce<T>(
    consumerName: string,
    eventId: string,
    effect: (manager: EntityManager) => Promise<T>,
  ): Promise<ProcessOnceResult<T>> {
    this.assertIdentifier(consumerName, 'consumerName');

    this.assertIdentifier(eventId, 'eventId');

    const lockKey = JSON.stringify([consumerName, eventId]);

    return this.dataSource.transaction(async (manager) => {
      /*
       * Serialize processing of this logical
       * consumer/event pair across every application
       * instance connected to this PostgreSQL database.
       */
      await manager.query(
        `
            SELECT pg_advisory_xact_lock(
              hashtextextended($1, 0)
            )
          `,
        [lockKey],
      );

      const alreadyProcessed = await manager.existsBy(ProcessedEvent, {
        consumerName,
        eventId,
      });

      if (alreadyProcessed) {
        return {
          processed: false,
        };
      }

      /*
       * IMPORTANT:
       *
       * effect() should perform transactional database
       * work through this EntityManager.
       *
       * Do not perform irreversible external side effects
       * here unless those systems are independently
       * idempotent.
       */
      const value = await effect(manager);

      await manager.insert(ProcessedEvent, {
        consumerName,
        eventId,
      });

      return {
        processed: true,
        value,
      };
    });
  }

  private assertIdentifier(value: string, name: string): void {
    if (
      typeof value !== 'string' ||
      value.trim().length === 0 ||
      value.length > 255
    ) {
      throw new TypeError(
        `${name} must be a non-empty string of at most 255 characters`,
      );
    }
  }
}
