import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PublicationStatus } from '../../../common/enums/publication-status.enum';
import { ConferenceProgramsEntity } from '../../conferences/entity/conference-programs.entity';

@Entity({ name: 'programs', schema: 'public' })
export class ProgramsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  slug!: string;
  @Column()
  name!: string;
  @Column({ type: 'text', nullable: true })
  summary!: string | null;
  @Column({ type: 'text', nullable: true })
  description!: string | null;
  @Column({ type: 'uuid', nullable: true })
  featuredMediaId!: string | null;
  @Column({
    type: 'varchar',
    default: PublicationStatus.DRAFT,
  })
  publicationStatus!: PublicationStatus;
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date | null;
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date | null;

  @OneToMany(
    () => ConferenceProgramsEntity,
    (conferenceProgram) => conferenceProgram.program,
  )
  conferences!: ConferenceProgramsEntity[];
}
