import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FileType } from '../enums/file-type.enum';
import { StorageType } from '../enums/storage-type.enum';

@Entity({ name: 'storage_files', schema: 'public' })
@Index('idx_storage_files_type_created_at', ['fileType', 'createdAt'])
export class StorageFileEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  storageType!: StorageType;

  @Column({ type: 'varchar' })
  fileType!: FileType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  originalName!: string | null;

  @Column({ type: 'text', nullable: true, unique: true })
  storageKey!: string | null;

  @Column({ type: 'text' })
  url!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  mimeType!: string | null;

  @Column({ type: 'bigint', nullable: true })
  fileSize!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date | null;
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date | null;
}
