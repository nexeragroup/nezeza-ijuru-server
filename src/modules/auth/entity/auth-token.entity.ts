import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { UsersEntity } from '../../users/entity/users.entity';

export const AUTH_TOKEN_PURPOSES = [
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'INVITATION',
  'MFA_LOGIN',
] as const;

export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number];

@Entity({
  name: 'auth_tokens',
  schema: 'public',
})
@Index('uq_auth_tokens_token_hash', ['tokenHash'], {
  unique: true,
})
@Index('idx_auth_tokens_user_purpose_consumed', [
  'userId',
  'purpose',
  'consumedAt',
])
@Index('idx_auth_tokens_expires_at', ['expiresAt'])
@Index('idx_auth_tokens_created_at', ['createdAt'])
@Check('chk_auth_tokens_token_hash', `"tokenHash" ~ '^[0-9a-f]{64}$'`)
@Check(
  'chk_auth_tokens_purpose',
  `"purpose" IN (
    'EMAIL_VERIFICATION',
    'PASSWORD_RESET',
    'INVITATION',
    'MFA_LOGIN'
  )`,
)
export class AuthTokenEntity {
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
   * Token
   * ----------------------------------------------------------------
   */

  /**
   * SHA-256 hexadecimal hash.
   *
   * Never persist the raw verification/reset/MFA token.
   */
  @Column({
    type: 'varchar',
    length: 64,
  })
  tokenHash!: string;

  @Column({
    type: 'varchar',
    length: 30,
  })
  purpose!: AuthTokenPurpose;

  /*
   * ----------------------------------------------------------------
   * Lifecycle
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
  consumedAt!: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
  })
  createdAt!: Date;
}
