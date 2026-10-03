import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { RolesEntity } from '../../roles/entity/roles.entity';

@Entity({ name: 'permissions', schema: 'public' })
@Index('uq_permissions_name', ['name'], { unique: true })
@Check('chk_permissions_name_canonical', `"name" = LOWER(BTRIM("name"))`)
export class PermissionsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Stable machine-readable permission identifier.
   *
   * Examples:
   *
   * storage.upload
   * storage.read
   * storage.delete
   */
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  /**
   * Roles containing this permission.
   *
   * Cascades are intentionally disabled so saving/deleting
   * a permission cannot unexpectedly modify roles.
   */
  @ManyToMany(() => RolesEntity, (role) => role.permissions, {
    cascade: false,
    onDelete: 'CASCADE',
    onUpdate: 'NO ACTION',
  })
  roles!: RolesEntity[];

  @CreateDateColumn({ type: 'timestamptz', precision: 3 })
  createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz', precision: 3 })
  updatedAt!: Date;
}
