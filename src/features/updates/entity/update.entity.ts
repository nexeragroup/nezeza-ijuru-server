import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  Index,
  Check,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { UsersEntity } from '../../../modules/users/entity/users.entity';
import { PublicationStatus } from '../../../common/enums/publication-status.enum';
import { ConferencesEntity } from '../../conferences/entity/conferences.entity';
import { EventsEntity } from '../../events/entity/events.entity';
import { SessionsEntity } from '../../sessions/entity/sessions.entity';

export enum UpdateCategory {
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  PREPARATION = 'PREPARATION',
  REGISTRATION = 'REGISTRATION',
  EVENT = 'EVENT',
  GENERAL = 'GENERAL',
}

@Entity({ name: 'updates', schema: 'public' })
@Check(
  'ck_updates_target',
  'num_nonnulls("conferenceId", "eventId", "sessionId") <= 1',
)
@Check(
  'ck_updates_window',
  '"visibleUntil" IS NULL OR "visibleFrom" IS NULL OR "visibleUntil" > "visibleFrom"',
)
@Check(
  'ck_updates_status',
  `"publicationStatus" IN ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED')`,
)
@Check(
  'ck_updates_category',
  `"category" IN ('ANNOUNCEMENT', 'PREPARATION', 'REGISTRATION', 'EVENT', 'GENERAL')`,
)
@Index('idx_updates_visibility', [
  'publicationStatus',
  'visibleFrom',
  'visibleUntil',
])
export class UpdateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 160 })
  title!: string;
  @Column({ type: 'text' })
  message!: string;
  @Column({ type: 'varchar', default: UpdateCategory.ANNOUNCEMENT })
  category!: UpdateCategory;
  @Column({ type: 'varchar', length: 40, nullable: true })
  label!: string | null;
  @Column({ type: 'varchar', default: PublicationStatus.DRAFT })
  publicationStatus!: PublicationStatus;
  @Column({ type: 'timestamptz', nullable: true })
  visibleFrom!: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  visibleUntil!: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
  @Column({ type: 'integer', default: 0 })
  priority!: number;
  @Column({ type: 'varchar', length: 50, nullable: true })
  actionLabel!: string | null;
  @Column({ type: 'varchar', length: 2000, nullable: true })
  actionUrl!: string | null;
  @VersionColumn()
  version!: number;
  // Authentication uses numeric user IDs; inherited legacy actor columns are UUIDs.
  @Column({ type: 'integer', nullable: true })
  createdByUserId!: number | null;
  @Column({ type: 'integer', nullable: true })
  updatedByUserId!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'uuid', nullable: true })
  conferenceId!: string | null;
  @ManyToOne(() => ConferencesEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'conferenceId',
    foreignKeyConstraintName: 'fk_updates_conference',
  })
  conference!: ConferencesEntity | null;

  @Column({ type: 'uuid', nullable: true })
  eventId!: string | null;
  @ManyToOne(() => EventsEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'eventId', foreignKeyConstraintName: 'fk_updates_event' })
  event!: EventsEntity | null;

  @Column({ type: 'uuid', nullable: true })
  sessionId!: string | null;
  @ManyToOne(() => SessionsEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'sessionId',
    foreignKeyConstraintName: 'fk_updates_session',
  })
  session!: SessionsEntity | null;
  @ManyToOne(() => UsersEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'createdByUserId',
    foreignKeyConstraintName: 'fk_updates_creator',
  })
  creator!: UsersEntity | null;
  @ManyToOne(() => UsersEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'updatedByUserId',
    foreignKeyConstraintName: 'fk_updates_editor',
  })
  editor!: UsersEntity | null;
}
