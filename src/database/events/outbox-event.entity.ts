import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export enum OutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
}

@Entity({
  name: 'outbox_events',
  schema: 'public',
})
@Index('idx_outbox_events_dispatch', ['status', 'availableAt', 'createdAt'])
@Index('idx_outbox_events_lease', ['status', 'leaseExpiresAt'])
@Index('idx_outbox_events_aggregate', ['aggregateType', 'aggregateId'])
@Index('idx_outbox_events_published_at', ['publishedAt'])
@Check('chk_outbox_schema_version_positive', '"schemaVersion" > 0')
@Check('chk_outbox_attempts_non_negative', '"attempts" >= 0')
export class OutboxEvent {
  @PrimaryColumn({
    type: 'uuid',
  })
  eventId!: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  eventType!: string;

  @Column({
    type: 'int',
  })
  schemaVersion!: number;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  aggregateType!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  aggregateId!: string | null;

  @Column({
    type: 'jsonb',
  })
  payload!: Record<string, unknown>;

  @Column({
    type: 'jsonb',
    default: () => `'{}'::jsonb`,
  })
  headers!: Record<string, string>;

  @Column({
    type: 'enum',
    enum: OutboxStatus,
    enumName: 'outbox_status_enum',

    default: OutboxStatus.PENDING,
  })
  status!: OutboxStatus;

  @Column({
    type: 'int',
    default: 0,
  })
  attempts!: number;

  @Column({
    type: 'timestamptz',
    precision: 3,

    default: () => 'CURRENT_TIMESTAMP',
  })
  availableAt!: Date;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
  })
  createdAt!: Date;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  publishedAt!: Date | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  claimToken!: string | null;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  leaseExpiresAt!: Date | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  lastError!: string | null;
}
