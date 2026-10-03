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
import { ProgramsEntity } from '../../programs/entity/programs.entity';
import { ConferencesEntity } from './conferences.entity';
import { EventsEntity } from '../../events/entity/events.entity';

@Entity({ name: 'conference_programs', schema: 'public' })
export class ConferenceProgramsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', nullable: true })
  conferenceSummary!: string | null;
  @Column({ default: false })
  isFeatured!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date | null;
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date | null;

  @Column({ type: 'uuid' })
  conferenceId!: string;
  @ManyToOne(() => ConferencesEntity, (conference) => conference.programs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conferenceId' })
  conference!: ConferencesEntity;

  @Column({ type: 'uuid' })
  programId!: string;
  @ManyToOne(() => ProgramsEntity, (program) => program.conferences, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'programId' })
  program!: ProgramsEntity;

  @OneToMany(() => EventsEntity, (event) => event.conferenceProgram)
  events!: EventsEntity[];
}
