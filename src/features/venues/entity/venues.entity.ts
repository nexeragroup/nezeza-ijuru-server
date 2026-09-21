import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventsEntity } from '../../events/entity/events.entity';
import { SessionsEntity } from '../../sessions/entity/sessions.entity';

@Entity({ name: 'venues', schema: 'public' })
export class VenuesEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;
  @Column({ type: 'varchar', nullable: true })
  address!: string | null;
  @Column({ type: 'text', nullable: true })
  city!: string | null;
  @Column({ default: true })
  active!: boolean;
  @Column({ type: 'varchar', nullable: true })
  district!: string | null;
  @Column({ default: 'Rwanda' })
  country!: string;
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: string | null;
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: string | null;
  @Column({ type: 'text', nullable: true })
  map!: string | null;
  @Column({ type: 'integer', nullable: true })
  capacity!: number | null;
  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;
  @Column({ type: 'varchar', nullable: true })
  email!: string | null;
  @Column({ type: 'text', nullable: true })
  instructions!: string | null;
  @Column({ type: 'text', nullable: true })
  website!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date | null;
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date | null;

  @OneToMany(() => EventsEntity, (event) => event.defaultVenue)
  events!: EventsEntity[];

  @OneToMany(() => SessionsEntity, (session) => session.venue)
  sessions!: SessionsEntity[];
}
