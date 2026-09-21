import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UsersEntity } from '../../users/entity/users.entity';

@Entity({
  name: 'auth_sessions',
  schema: 'public',
})
@Index('uq_auth_sessions_token_hash', ['tokenHash'], {
  unique: true,
})
@Index('idx_auth_sessions_user_revoked', ['userId', 'revokedAt'])
@Index('idx_auth_sessions_user_expires', ['userId', 'expiresAt'])
@Index('idx_auth_sessions_family', ['familyId'])
@Index('idx_auth_sessions_family_revoked', ['familyId', 'revokedAt'])
@Index('idx_auth_sessions_expires_at', ['expiresAt'])
@Check('chk_auth_sessions_token_hash', `"tokenHash" ~ '^[0-9a-f]{64}$'`)
@Check('chk_auth_sessions_family_id_not_blank', `LENGTH(BTRIM("familyId")) > 0`)
export class AuthSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /*
   * ----------------------------------------------------------------
   * User
   * ----------------------------------------------------------------
   */

  @Column({
    type: 'uuid',
  })
  userId!: string;

  @ManyToOne(() => UsersEntity, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({
    name: 'userId',
  })
  user!: UsersEntity;

  /*
   * ----------------------------------------------------------------
   * Refresh-token identity
   * ----------------------------------------------------------------
   */

  /**
   * SHA-256 hexadecimal hash of the refresh token.
   *
   * Raw refresh tokens must never be persisted.
   */
  @Column({
    type: 'varchar',
    length: 64,
  })
  tokenHash!: string;

  /**
   * Groups refresh tokens belonging to the same rotation family.
   *
   * This allows refresh-token reuse detection to revoke the
   * complete token family.
   */
  @Column({
    type: 'varchar',
    length: 64,
  })
  familyId!: string;

  /*
   * ----------------------------------------------------------------
   * Lifetime / revocation
   * ----------------------------------------------------------------
   */

  @Column({
    type: 'timestamptz',
    precision: 3,
  })
  expiresAt!: Date;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  revokedAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  revokeReason!: string | null;

  /*
   * ----------------------------------------------------------------
   * Session metadata
   * ----------------------------------------------------------------
   */

  /**
   * Supports both IPv4 and IPv6.
   */
  @Column({
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  ip!: string | null;

  /**
   * User-Agent is bounded so an attacker cannot persist
   * arbitrarily large headers into the database.
   */
  @Column({
    type: 'varchar',
    length: 1024,
    nullable: true,
  })
  userAgent!: string | null;

  @Column({
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  lastUsedAt!: Date | null;

  /*
   * ----------------------------------------------------------------
   * Audit timestamps
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
