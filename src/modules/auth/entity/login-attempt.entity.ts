import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const LOGIN_ATTEMPT_RESULTS = [
  'SUCCESS',
  'FAILURE',
  'LOCKED',
  'MFA_REQUIRED',
] as const;

export type LoginAttemptResult = (typeof LOGIN_ATTEMPT_RESULTS)[number];

@Entity({
  name: 'login_attempts',
  schema: 'public',
})
@Index('idx_login_attempts_identifier_created', ['identifierHash', 'createdAt'])
@Index('idx_login_attempts_ip_created', ['ip', 'createdAt'])
@Index('idx_login_attempts_user_created', ['userId', 'createdAt'])
@Index('idx_login_attempts_result_created', ['result', 'createdAt'])
@Index('idx_login_attempts_created_at', ['createdAt'])
@Check(
  'chk_login_attempt_identifier_hash',
  `"identifierHash" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'chk_login_attempt_result',
  `"result" IN (
    'SUCCESS',
    'FAILURE',
    'LOCKED',
    'MFA_REQUIRED'
  )`,
)
export class LoginAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Nullable because a login attempt may use an identifier
   * that does not belong to any account.
   *
   * Intentionally no FK: security history should survive
   * account deletion.
   */
  @Column({
    type: 'uuid',
    nullable: true,
  })
  userId!: string | null;

  /**
   * SHA-256 hash of the normalized username/email.
   *
   * Prevents raw identifiers from unnecessarily appearing
   * in security telemetry.
   */
  @Column({
    type: 'varchar',
    length: 64,
  })
  identifierHash!: string;

  /**
   * IPv4 or IPv6 address.
   */
  @Column({
    type: 'varchar',
    length: 45,
  })
  ip!: string;

  @Column({
    type: 'varchar',
    length: 1024,
    nullable: true,
  })
  userAgent!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
  })
  result!: LoginAttemptResult;

  /**
   * Stable internal reason identifier.
   *
   * Examples:
   *
   * INVALID_CREDENTIALS
   * ACCOUNT_LOCKED
   * ACCOUNT_SUSPENDED
   * EMAIL_NOT_VERIFIED
   */
  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  reason!: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
  })
  createdAt!: Date;
}
