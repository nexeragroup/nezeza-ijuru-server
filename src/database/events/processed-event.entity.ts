import {
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({
  name: 'processed_events',
  schema: 'public',
})
@Index('idx_processed_events_processed_at', ['processedAt'])
export class ProcessedEvent {
  @PrimaryColumn({
    type: 'varchar',
    length: 255,
  })
  consumerName!: string;

  @PrimaryColumn({
    type: 'uuid',
  })
  eventId!: string;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
  })
  processedAt!: Date;
}
