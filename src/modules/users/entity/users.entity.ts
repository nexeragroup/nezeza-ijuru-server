import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Status } from '../../../common/enums/status.enum';
import { RolesEntity } from '../../roles/entity/roles.entity';

@Entity({
  name: 'users',
  schema: 'public',
})
@Index('uq_users_username', ['username'], {
  unique: true,
})
@Index('uq_users_email', ['email'], {
  unique: true,
})
@Index('uq_users_pending_email', ['pendingEmail'], {
  unique: true,
})
@Index('idx_users_status_locked', ['status', 'isLocked'])
@Index('idx_users_created_at', ['createdAt'])
@Check('chk_users_username_normalized', `"username" = LOWER(BTRIM("username"))`)
@Check('chk_users_email_normalized', `"email" = LOWER(BTRIM("email"))`)
@Check(
  'chk_users_pending_email_normalized',
  `"pendingEmail" IS NULL OR "pendingEmail" = LOWER(BTRIM("pendingEmail"))`,
)
@Check(
  'chk_users_failed_login_attempts_non_negative',
  `"failedLoginAttempts" >= 0`,
)
@Check('chk_users_token_version_non_negative', `"tokenVersion" >= 0`)
export class UsersEntity {
  /*
   * ----------------------------------------------------------------
   * Identity
   * ----------------------------------------------------------------
   */

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 150,
  })
  firstname!: string;

  @Column({
    type: 'varchar',
    length: 150,
  })
  lastname!: string;

  @Column({
    type: 'varchar',
    length: 150,
  })
  username!: string;

  @Column({
    type: 'varchar',
    length: 254,
  })
  email!: string;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  emailVerifiedAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 254,
    nullable: true,
  })
  pendingEmail!: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  phone!: string | null;

  /*
   * Contains an Argon2id password hash, never plaintext.
   */
  @Column({
    type: 'varchar',
    length: 255,
    select: false,
  })
  password!: string;

  /*
   * ----------------------------------------------------------------
   * Organization / reference
   * ----------------------------------------------------------------
   *
   * PostgreSQL bigint should be represented as a string in
   * application code to avoid JavaScript precision loss.
   */

  @Column({
    type: 'bigint',
    nullable: true,
  })
  reference!: string | null;

  /*
   * ----------------------------------------------------------------
   * Roles
   * ----------------------------------------------------------------
   */

  @ManyToMany(() => RolesEntity, (role) => role.users, {
    cascade: false,
  })
  @JoinTable({
    name: 'users_roles',

    joinColumn: {
      name: 'userId',
      referencedColumnName: 'id',
    },

    inverseJoinColumn: {
      name: 'roleId',
      referencedColumnName: 'id',
    },
  })
  roles!: RolesEntity[];

  /*
   * ----------------------------------------------------------------
   * Account status
   * ----------------------------------------------------------------
   */

  @Column({
    type: 'varchar',
    length: 20,
    default: Status.ACTIVE,
  })
  status!: Status;

  @Column({
    type: 'boolean',
    default: false,
  })
  isLocked!: boolean;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  lockedAt!: Date | null;

  /*
   * ----------------------------------------------------------------
   * Login security
   * ----------------------------------------------------------------
   */

  @Column({
    type: 'int',
    default: 0,
  })
  failedLoginAttempts!: number;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  lockExpiresAt!: Date | null;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  lastFailedLoginAt!: Date | null;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  lastLoginAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  lastLoginIp!: string | null;

  /*
   * ----------------------------------------------------------------
   * Two-factor authentication
   * ----------------------------------------------------------------
   */

  @Column({
    type: 'text',
    nullable: true,
    select: false,
  })
  twoFactorSecret!: string | null;

  @Column({
    type: 'boolean',
    default: false,
  })
  isTwoFactorEnabled!: boolean;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  twoFactorVerifiedAt!: Date | null;

  /*
   * ----------------------------------------------------------------
   * Password / session security
   * ----------------------------------------------------------------
   */

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  passwordChangedAt!: Date | null;

  @Column({
    type: 'boolean',
    default: false,
  })
  forcePasswordChange!: boolean;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    select: false,
  })
  refreshTokenHash!: string | null;

  @Column({
    type: 'int',
    default: 0,
  })
  tokenVersion!: number;

  /*
   * ----------------------------------------------------------------
   * Audit
   * ----------------------------------------------------------------
   */

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    precision: 3,
  })
  updatedAt!: Date;
}
