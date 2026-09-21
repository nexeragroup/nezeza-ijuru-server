import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({
  name: 'dead_letter_events',
  schema: 'public',
})
@Index('uq_dead_letter_events_dead_letter_id', ['deadLetterId'], {
  unique: true,
})
@Index('idx_dead_letter_events_event_id', ['eventId'])
@Index('idx_dead_letter_events_queue_failed_at', ['queueName', 'failedAt'])
@Index('idx_dead_letter_events_replayed_at', ['replayedAt'])
@Index('idx_dead_letter_events_created_at', ['createdAt'])
@Check('chk_dead_letter_schema_version_positive', '"schemaVersion" > 0')
@Check('chk_dead_letter_attempts_non_negative', '"attempts" >= 0')
export class DeadLetterEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  deadLetterId!: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  queueName!: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  jobId!: string;

  @Column({
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
    type: 'jsonb',
  })
  payload!: Record<string, unknown>;

  @Column({
    type: 'jsonb',
    default: () => `'{}'::jsonb`,
  })
  headers!: Record<string, string>;

  @Column({
    type: 'int',
    default: 0,
  })
  attempts!: number;

  @Column({
    type: 'varchar',
    length: 255,
  })
  errorName!: string;

  @Column({
    type: 'text',
  })
  errorMessage!: string;

  @Column({
    type: 'timestamptz',
    precision: 3,
  })
  failedAt!: Date;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  replayedAt!: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
  })
  createdAt!: Date;
}
