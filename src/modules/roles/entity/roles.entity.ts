import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { PermissionsEntity } from '../../permissions/entity/permissions.entity';
import { UsersEntity } from '../../users/entity/users.entity';

@Entity({ name: 'roles', schema: 'public' })
@Index('uq_roles_name', ['name'], { unique: true })
@Check('chk_roles_name_canonical', `"name" = UPPER(BTRIM("name"))`)
export class RolesEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Stable machine-readable role identifier.
   *
   * Examples:
   *
   * ADMIN
   * DEVELOPER
   * SUPER_ADMIN
   * SALES_MANAGER
   */
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @CreateDateColumn({ type: 'timestamptz', precision: 3 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3 }) updatedAt!: Date;

  /**
   * Property name is normalized to deletedAt.
   *
   * The physical database column remains "deleteAt"
   * for backward compatibility with your current schema.
   */
  @DeleteDateColumn({
    name: 'deleteAt',
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  deletedAt!: Date | null;

  /**
   * Users assigned to this role.
   *
   * No cascading lifecycle operations are allowed here.
   */
  @ManyToMany(() => UsersEntity, (user) => user.roles, {
    cascade: false,
  })
  users!: UsersEntity[];

  /**
   * Permissions belonging to this role.
   *
   * RolesEntity owns the roles_permissions junction table.
   */
  @ManyToMany(() => PermissionsEntity, (permission) => permission.roles, {
    cascade: false,
  })
  @JoinTable({
    name: 'roles_permissions',

    joinColumn: {
      name: 'roleId',
      referencedColumnName: 'id',
    },

    inverseJoinColumn: {
      name: 'permissionId',
      referencedColumnName: 'id',
    },
  })
  permissions!: PermissionsEntity[];
}
