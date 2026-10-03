import { Injectable } from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { EntityManager } from 'typeorm';

import {
  OutboxEvent,
  OutboxStatus,
} from '../../database/events/outbox-event.entity';

export interface AddOutboxEventInput {
  readonly eventId?: string;

  readonly eventType: string;

  readonly schemaVersion: number;

  readonly payload: Record<string, unknown>;

  readonly headers?: Readonly<Record<string, string>>;

  readonly aggregateType?: string;

  readonly aggregateId?: string;

  readonly availableAt?: Date;
}

@Injectable()
export class OutboxService {
  async add(
    manager: EntityManager,
    input: AddOutboxEventInput,
  ): Promise<OutboxEvent> {
    this.assertActiveTransaction(manager);

    this.validateInput(input);

    const event = manager.create(OutboxEvent, {
      eventId: input.eventId ?? randomUUID(),

      eventType: input.eventType.trim(),

      schemaVersion: input.schemaVersion,

      payload: input.payload,

      headers: input.headers
        ? {
            ...input.headers,
          }
        : {},

      aggregateType: input.aggregateType?.trim() || null,

      aggregateId: input.aggregateId?.trim() || null,

      availableAt: input.availableAt ?? new Date(),

      status: OutboxStatus.PENDING,

      attempts: 0,

      publishedAt: null,

      claimToken: null,

      leaseExpiresAt: null,

      lastError: null,
    });

    return manager.save(OutboxEvent, event);
  }

  private assertActiveTransaction(manager: EntityManager): void {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error(
        'OutboxService.add() must be called inside an active database transaction',
      );
    }
  }

  private validateInput(input: AddOutboxEventInput): void {
    this.assertIdentifier(input.eventType, 'eventType');

    if (
      !Number.isSafeInteger(input.schemaVersion) ||
      input.schemaVersion <= 0
    ) {
      throw new TypeError('schemaVersion must be a positive integer');
    }

    if (input.eventId !== undefined) {
      this.assertIdentifier(input.eventId, 'eventId');
    }

    if (input.aggregateType !== undefined) {
      this.assertIdentifier(input.aggregateType, 'aggregateType');
    }

    if (input.aggregateId !== undefined) {
      this.assertIdentifier(input.aggregateId, 'aggregateId');
    }

    if (
      input.availableAt !== undefined &&
      Number.isNaN(input.availableAt.getTime())
    ) {
      throw new TypeError('availableAt must be a valid date');
    }
  }

  private assertIdentifier(value: string, name: string): void {
    if (typeof value !== 'string' || !value.trim() || value.length > 255) {
      throw new TypeError(
        `${name} must be a non-empty string of at most 255 characters`,
      );
    }
  }
}
