import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum AuditLogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug',
}

export interface AuditLogDevice {
  deviceId?: string;
  deviceType?: string;
  os?: string;
  browser?: string;
}

@Entity({
  name: 'audit_logs',
  schema: 'public',
})
@Index('idx_audit_logs_level_created_at', ['level', 'createdAt'])
@Index('idx_audit_logs_category_created_at', ['category', 'createdAt'])
@Index('idx_audit_logs_user_created_at', ['userId', 'createdAt'])
@Index('idx_audit_logs_request_id', ['requestId'])
@Index('idx_audit_logs_trace_id', ['traceId'])
@Index('idx_audit_logs_created_at', ['createdAt'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn({
    type: 'bigint',
  })
  id!: string;

  @Column({
    type: 'enum',
    enum: AuditLogLevel,
    enumName: 'audit_log_level_enum',
    default: AuditLogLevel.INFO,
  })
  level!: AuditLogLevel;

  @Column({
    type: 'varchar',
    length: 100,
    default: 'application',
  })
  category!: string;

  @Column({
    type: 'text',
  })
  message!: string;

  @Column({
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  method!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  url!: string | null;

  @Column({
    type: 'smallint',
    nullable: true,
  })
  statusCode!: number | null;

  @Column({
    type: 'int',
    nullable: true,
  })
  durationMs!: number | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  requestId!: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  traceId!: string | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  userId!: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  ipAddress!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  userAgent!: string | null;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  device!: AuditLogDevice | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  errorName!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  errorStack!: string | null;

  @Column({
    type: 'jsonb',
    default: () => `'{}'::jsonb`,
  })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
  })
  createdAt!: Date;
}
