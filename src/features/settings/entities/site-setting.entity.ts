import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'site_settings', schema: 'public' })
export class SiteSettingEntity {
  @PrimaryColumn({ name: 'setting_key', type: 'varchar', length: 160 })
  settingKey!: string;

  @Column({ type: 'jsonb' })
  value!: Record<string, unknown>;

  @Column({ name: 'is_public', default: false })
  isPublic!: boolean;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
