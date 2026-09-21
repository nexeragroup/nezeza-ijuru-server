import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InvitationAttendanceStatus } from '../../../common/enums/invitation-attendance-status.enum';
import { InvitationScope } from '../../../common/enums/invitation-scope.enum';
import { InvitationStatus } from '../../../common/enums/invitation-status.enum';
import { PublicationStatus } from '../../../common/enums/publication-status.enum';
import { EventsEntity } from '../../events/entity/events.entity';
import { SessionsEntity } from '../../sessions/entity/sessions.entity';
import { InvitationRolesEntity } from './invitation-role.entity';
import { InviteesEntity } from '../../invitees/entities/invitee.entity';

@Entity({ name: 'invitations', schema: 'public' })
@Check(
  'chk_invitations_scope',
  `(scope = 'EVENT' AND "sessionId" IS NULL) OR (scope = 'SESSION' AND "sessionId" IS NOT NULL)`,
)
export class InvitationsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 40, unique: true })
  reference!: string;
  @Column({ type: 'enum', enum: InvitationScope })
  scope!: InvitationScope;
  @Column({
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.DRAFT,
  })
  status!: InvitationStatus;
  @Column({
    type: 'enum',
    enum: InvitationAttendanceStatus,
    default: InvitationAttendanceStatus.NOT_RECORDED,
  })
  attendanceStatus!: InvitationAttendanceStatus;
  @Column({ type: 'timestamptz', nullable: true })
  invitedAt!: Date | null;
  @Column({ type: 'text', nullable: true })
  invitationMessage!: string | null;
  @Column({ type: 'timestamptz', nullable: true })
  expectedArrivalAt!: Date | null;
  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  expectedDepartureAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  declinedAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  checkedInAt!: Date | null;
  @Column({ type: 'integer', nullable: true })
  numberOfPeople!: number | null;
  @Column({ default: false })
  accommodationRequired!: boolean;
  @Column({ default: false })
  transportRequired!: boolean;
  @Column({ type: 'text', nullable: true })
  specialRequirements!: string | null;
  @Column({ type: 'text', nullable: true })
  internalNotes!: string | null;
  @Column({ type: 'text', nullable: true })
  publicNotes!: string | null;
  @Column({ default: false })
  isFeatured!: boolean;
  @Column({
    type: 'enum',
    enum: PublicationStatus,
    default: PublicationStatus.DRAFT,
  })
  publicationStatus!: PublicationStatus;
  @Column({ type: 'timestamptz', nullable: true })
  notificationSentAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  lastReminderAt!: Date | null;
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date | null;
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date | null;

  @Column({ type: 'uuid' })
  inviteeId!: string;
  @ManyToOne(() => InviteesEntity, (invitee) => invitee.invitations, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'inviteeId' })
  invitee!: InviteesEntity;

  @Column({ type: 'uuid' })
  eventId!: string;
  @ManyToOne(() => EventsEntity, (event) => event.invitations, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'eventId' })
  event!: EventsEntity;

  @Column({ type: 'uuid', nullable: true })
  sessionId!: string | null;
  @ManyToOne(() => SessionsEntity, (session) => session.invitations, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn([
    { name: 'sessionId', referencedColumnName: 'id' },
    { name: 'eventId', referencedColumnName: 'eventId' },
  ])
  session!: SessionsEntity | null;

  @OneToMany(() => InvitationRolesEntity, (role) => role.invitation, {
    cascade: ['insert'],
  })
  roles!: InvitationRolesEntity[];
}
