import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AttendeeStatus } from '../../../common/enums/attendee-status.enum';
import { AttendeeType } from '../../../common/enums/attendee-type.enum';
import { EventsEntity } from '../../events/entity/events.entity';
import { SessionsEntity } from '../../sessions/entity/sessions.entity';

@Entity({ name: 'attendees', schema: 'public' })
@Check(
  'chk_attendees_target',
  `("attendeeType" = 'EVENT' AND "eventId" IS NOT NULL AND "sessionId" IS NULL) OR ("attendeeType" = 'SESSION' AND "sessionId" IS NOT NULL AND "eventId" IS NULL)`,
)
@Index('uq_attendees_event_email', ['eventId', 'email'], {
  unique: true,
  where: `"eventId" IS NOT NULL AND "deletedAt" IS NULL`,
})
@Index('uq_attendees_session_email', ['sessionId', 'email'], {
  unique: true,
  where: `"sessionId" IS NOT NULL AND "deletedAt" IS NULL`,
})
export class AttendeesEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  firstName!: string;
  @Column()
  lastName!: string;
  @Column()
  email!: string;
  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;
  @Column({ type: 'varchar', nullable: true })
  organization!: string | null;
  @Column({ type: 'varchar' })
  attendeeType!: AttendeeType;
  @Column({ type: 'varchar', default: AttendeeStatus.REGISTERED })
  status!: AttendeeStatus;
  @Column({ default: false })
  checkedIn!: boolean;
  @Column({ type: 'timestamptz', nullable: true })
  checkedInAt!: Date | null;
  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date | null;
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date | null;
  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  eventId!: string | null;
  @ManyToOne(() => EventsEntity, (event) => event.attendees, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'eventId' })
  event!: EventsEntity | null;

  @Column({ type: 'uuid', nullable: true })
  sessionId!: string | null;
  @ManyToOne(() => SessionsEntity, (session) => session.attendees, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session!: SessionsEntity | null;
}
