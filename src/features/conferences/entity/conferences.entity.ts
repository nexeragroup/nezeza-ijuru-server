import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PublicationStatus } from '../../../common/enums/publication-status.enum';
import { ConferenceProgramsEntity } from './conference-programs.entity';
import { MediaEntity } from '../../media/entity/media.entity';

@Entity({ name: 'conferences', schema: 'public' })
export class ConferencesEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'integer', unique: true })
  year!: number;
  @Column({ unique: true })
  slug!: string;
  @Column()
  title!: string;
  @Column()
  theme!: string;
  @Column({ type: 'text', nullable: true })
  summary!: string | null;
  @Column({ type: 'text', nullable: true })
  description!: string | null;
  @Column({ type: 'date', nullable: true })
  startDate!: string | null;
  @Column({ type: 'date', nullable: true })
  endDate!: string | null;
  @Column({ default: false })
  isCurrent!: boolean;
  @Column({
    type: 'varchar',
    default: PublicationStatus.DRAFT,
  })
  publicationStatus!: PublicationStatus;
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

  @OneToMany(
    () => ConferenceProgramsEntity,
    (conferenceProgram) => conferenceProgram.conference,
  )
  programs!: ConferenceProgramsEntity[];
  media?: MediaEntity[];
}
