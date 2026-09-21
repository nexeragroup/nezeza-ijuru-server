import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  MediaSourceType,
  MediaTargetType,
  MediaType,
} from '../../../common/enums/media.enum';

@Entity({ name: 'media', schema: 'public' })
@Index('idx_media_target', ['targetType', 'targetId'])
export class MediaEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  targetType!: MediaTargetType;
  @Column({ type: 'uuid' })
  targetId!: string;
  @Column({ type: 'varchar' })
  mediaType!: MediaType;
  @Column({ type: 'varchar' })
  sourceType!: MediaSourceType;
  @Column()
  title!: string;
  @Column({ type: 'text', nullable: true })
  caption!: string | null;
  @Column({ type: 'text', nullable: true })
  altText!: string | null;
  @Column({ type: 'text' })
  url!: string;
  @Column({ type: 'text', nullable: true })
  storageKey!: string | null;
  @Column({ type: 'text', nullable: true })
  mimeType!: string | null;
  @Column({ type: 'bigint', nullable: true })
  fileSize!: string | null;
  @Column({ type: 'integer', nullable: true })
  durationSeconds!: number | null;
  @Column({ default: false })
  isFeatured!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date | null;
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date | null;
}
