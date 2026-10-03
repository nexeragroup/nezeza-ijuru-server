import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SessionsEntity } from '../../sessions/entity/sessions.entity';
import { VenuesEntity } from '../../venues/entity/venues.entity';
import { EventStatus } from '../../../common/enums/event-status.enum';
import { LocationMode } from '../../../common/enums/location-mode.enum';
import { PublicationStatus } from '../../../common/enums/publication-status.enum';
import { ConferenceProgramsEntity } from '../../conferences/entity/conference-programs.entity';
import { AttendeesEntity } from '../../attendees/entity/attendees.entity';
import { InvitationsEntity } from '../../invitations/entities/invitation.entity';

@Entity({ name: 'events', schema: 'public' })
export class EventsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  slug!: string;
  @Column()
  title!: string;
  @Column()
  eventType!: string;
  @Column({ type: 'text', nullable: true })
  summary!: string | null;
  @Column({ type: 'text', nullable: true })
  description!: string | null;
  @Column({ type: 'varchar' })
  locationMode!: LocationMode;
  @Column({ default: 'Africa/Kigali' })
  timezone!: string;
  @Column({ type: 'timestamptz' })
  startAt!: Date;
  @Column({ type: 'timestamptz' })
  endAt!: Date;
  @Column({ type: 'integer', nullable: true })
  capacity!: number | null;
  @Column({ default: false })
  registrationRequired!: boolean;
  @Column({ type: 'timestamptz', nullable: true })
  registrationOpensAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  registrationClosesAt!: Date | null;
  @Column({ type: 'varchar', default: EventStatus.PLANNED })
  eventStatus!: EventStatus;
  @Column({ type: 'varchar', default: PublicationStatus.DRAFT })
  publicationStatus!: PublicationStatus;
  @Column({ default: false })
  isFeatured!: boolean;
  @Column({ type: 'uuid', nullable: true })
  featuredMediaId!: string | null;
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date | null;
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date | null;

  @Column({ type: 'uuid' })
  conferenceProgramId!: string;
  @ManyToOne(
    () => ConferenceProgramsEntity,
    (conferenceProgram) => conferenceProgram.events,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'conferenceProgramId' })
  conferenceProgram!: ConferenceProgramsEntity;

  @Column({ type: 'uuid', nullable: true })
  defaultVenueId!: string | null;
  @ManyToOne(() => VenuesEntity, (venue) => venue.events, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'defaultVenueId' })
  defaultVenue!: VenuesEntity | null;

  @OneToMany(() => SessionsEntity, (session) => session.event)
  sessions!: SessionsEntity[];

  @OneToMany(() => AttendeesEntity, (attendee) => attendee.event)
  attendees!: AttendeesEntity[];

  @OneToMany(() => InvitationsEntity, (invitation) => invitation.event)
  invitations!: InvitationsEntity[];
}
