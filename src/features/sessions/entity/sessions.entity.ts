import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventsEntity } from '../../events/entity/events.entity';
import { VenuesEntity } from '../../venues/entity/venues.entity';
import { PublicationStatus } from '../../../common/enums/publication-status.enum';
import { SessionStatus } from '../../../common/enums/session-status.enum';
import { AttendeesEntity } from '../../attendees/entity/attendees.entity';
import { InvitationsEntity } from '../../invitations/entities/invitation.entity';

@Entity({ name: 'sessions', schema: 'public' })
@Index('uq_sessions_id_event', ['id', 'eventId'], { unique: true })
export class SessionsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column()
  code!: string;
  @Column()
  slug!: string;
  @Column()
  title!: string;
  @Column({ type: 'text', nullable: true })
  description!: string | null;
  @Column({ type: 'timestamptz' })
  startAt!: Date;
  @Column({ type: 'timestamptz' })
  endAt!: Date;
  @Column({ type: 'integer', nullable: true })
  capacity!: number | null;
  @Column({ default: false })
  registrationRequired!: boolean;
  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  registrationOpensAt!: Date | null;
  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  registrationClosesAt!: Date | null;
  @Column({ name: 'stream_url', type: 'text', nullable: true })
  streamUrl!: string | null;
  @Column({
    type: 'varchar',
    default: SessionStatus.PLANNED,
  })
  sessionStatus!: SessionStatus;
  @Column({
    type: 'varchar',
    default: PublicationStatus.DRAFT,
  })
  publicationStatus!: PublicationStatus;
  @Column({ type: 'integer', default: 0 })
  displayOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date | null;
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date | null;

  @Column({ type: 'uuid' })
  eventId!: string;
  @ManyToOne(() => EventsEntity, (event) => event.sessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'eventId' })
  event!: EventsEntity;

  @Column({ type: 'uuid', nullable: true })
  venueId!: string | null;
  @ManyToOne(() => VenuesEntity, (venue) => venue.sessions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'venueId' })
  venue!: VenuesEntity | null;

  @OneToMany(() => AttendeesEntity, (attendee) => attendee.session)
  attendees!: AttendeesEntity[];

  @OneToMany(() => InvitationsEntity, (invitation) => invitation.session)
  invitations!: InvitationsEntity[];
}
