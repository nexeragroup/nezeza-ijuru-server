// @ts-nocheck
// Restored from the last verified compiled migration artifact.
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateApplicationSchema1790812800000 = void 0;
class CreateApplicationSchema1790812800000 {
  name = 'CreateApplicationSchema1790812800000';
  async up(queryRunner) {
    const statements = [
      `DO $$ BEGIN
        IF to_regtype('public.outbox_events_status_enum') IS NOT NULL
          AND to_regtype('public.outbox_status_enum') IS NULL THEN
          ALTER TYPE public.outbox_events_status_enum RENAME TO outbox_status_enum;
        END IF;
      END $$`,
      `DROP INDEX IF EXISTS public."IDX_outbox_events_status_available"`,
      `DROP INDEX IF EXISTS public."IDX_outbox_events_lease"`,
      `DROP INDEX IF EXISTS public."IDX_processed_events_consumer_event"`,
      `DROP INDEX IF EXISTS public."IDX_dead_letter_events_id"`,
      `ALTER TABLE public.outbox_events
        ALTER COLUMN "availableAt" TYPE timestamptz(3),
        ALTER COLUMN "createdAt" TYPE timestamptz(3),
        ALTER COLUMN "publishedAt" TYPE timestamptz(3),
        ALTER COLUMN "leaseExpiresAt" TYPE timestamptz(3),
        ALTER COLUMN headers SET DEFAULT '{}'::jsonb`,
      `ALTER TABLE public.processed_events DROP CONSTRAINT "PK_processed_events"`,
      `ALTER TABLE public.processed_events DROP COLUMN id`,
      `ALTER TABLE public.processed_events
        ALTER COLUMN "processedAt" TYPE timestamptz(3),
        ADD CONSTRAINT "PK_30487a0b7614c9b0b3ea84b8b6d"
          PRIMARY KEY ("consumerName", "eventId")`,
      `ALTER TABLE public.dead_letter_events
        ALTER COLUMN "errorName" TYPE varchar(255),
        ALTER COLUMN "failedAt" TYPE timestamptz(3),
        ALTER COLUMN "replayedAt" TYPE timestamptz(3),
        ALTER COLUMN "createdAt" TYPE timestamptz(3),
        ALTER COLUMN headers SET DEFAULT '{}'::jsonb`,
      `ALTER TABLE public.outbox_events
        ADD CONSTRAINT "chk_outbox_schema_version_positive"
          CHECK ("schemaVersion" > 0),
        ADD CONSTRAINT "chk_outbox_attempts_non_negative"
          CHECK (attempts >= 0)`,
      `ALTER TABLE public.dead_letter_events
        ADD CONSTRAINT "chk_dead_letter_schema_version_positive"
          CHECK ("schemaVersion" > 0),
        ADD CONSTRAINT "chk_dead_letter_attempts_non_negative"
          CHECK (attempts >= 0)`,
      `CREATE INDEX "idx_outbox_events_dispatch"
        ON public.outbox_events (status, "availableAt", "createdAt")`,
      `CREATE INDEX "idx_outbox_events_lease"
        ON public.outbox_events (status, "leaseExpiresAt")`,
      `CREATE INDEX "idx_outbox_events_aggregate"
        ON public.outbox_events ("aggregateType", "aggregateId")`,
      `CREATE INDEX "idx_outbox_events_published_at"
        ON public.outbox_events ("publishedAt")`,
      `CREATE INDEX "idx_processed_events_processed_at"
        ON public.processed_events ("processedAt")`,
      `CREATE UNIQUE INDEX "uq_dead_letter_events_dead_letter_id"
        ON public.dead_letter_events ("deadLetterId")`,
      `CREATE INDEX "idx_dead_letter_events_event_id"
        ON public.dead_letter_events ("eventId")`,
      `CREATE INDEX "idx_dead_letter_events_queue_failed_at"
        ON public.dead_letter_events ("queueName", "failedAt")`,
      `CREATE INDEX "idx_dead_letter_events_replayed_at"
        ON public.dead_letter_events ("replayedAt")`,
      `CREATE INDEX "idx_dead_letter_events_created_at"
        ON public.dead_letter_events ("createdAt")`,
      `CREATE TYPE public.notifications_channel_enum AS ENUM
        ('Email', 'SMS', 'Whatsapp', 'Push', 'In App')`,
      `CREATE TYPE public.notifications_status_enum AS ENUM
        ('Pending', 'Sending', 'Sent', 'Failed', 'Cancelled', 'Processing')`,
      `CREATE TYPE public.technologies_category_enum AS ENUM
        ('Programming Language', 'Frontend Framework', 'Frontend Library',
         'Backend Framework', 'Backend Library', 'Mobile Framework', 'Database',
         'Cache', 'Message Broker', 'Queue', 'API', 'Containerization',
         'Orchestration', 'DevOps', 'CI/CD', 'Cloud', 'Hosting', 'Version Control',
         'Testing', 'Security', 'Authentication', 'Monitoring', 'Observability',
         'Search', 'Artificial Intelligence', 'Machine Learning', 'UI/UX', 'CMS',
         'Other')`,
      `CREATE TYPE public.audit_log_level_enum AS ENUM ('info', 'warn', 'error', 'debug')`,
      `CREATE TABLE public.notifications (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        "idempotencyKey" varchar(150),
        channel public.notifications_channel_enum NOT NULL,
        recipient varchar(500) NOT NULL,
        title varchar(255),
        body text,
        "channelData" jsonb,
        "templateName" varchar(150),
        "templateData" jsonb,
        "sourceService" varchar(100) NOT NULL DEFAULT 'unknown',
        "requestedBy" varchar(150),
        status public.notifications_status_enum NOT NULL DEFAULT 'Pending',
        provider varchar(100),
        "providerMessageId" varchar(500),
        "attemptCount" integer NOT NULL DEFAULT 0,
        "lastAttemptAt" timestamptz,
        "failureCode" varchar(100),
        "failureReason" text,
        "sentAt" timestamptz,
        metadata jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY (id)
      )`,
      `CREATE TABLE public.permissions (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        name varchar(100) NOT NULL,
        "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
        "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY (id),
        CONSTRAINT "chk_permissions_name_canonical"
          CHECK (name = UPPER(BTRIM(name)))
      )`,
      `CREATE TABLE public.roles (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        name varchar(100) NOT NULL,
        description varchar(500),
        "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
        "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
        "deleteAt" timestamptz(3),
        CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY (id),
        CONSTRAINT "chk_roles_name_canonical"
          CHECK (name = UPPER(BTRIM(name)))
      )`,
      `CREATE TABLE public.users (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        firstname varchar(150) NOT NULL,
        lastname varchar(150) NOT NULL,
        username varchar(150) NOT NULL,
        email varchar(254) NOT NULL,
        "emailVerifiedAt" timestamptz(3),
        "pendingEmail" varchar(254),
        phone varchar(30),
        password varchar(255) NOT NULL,
        reference bigint,
        status varchar(20) NOT NULL DEFAULT 'Active',
        "isLocked" boolean NOT NULL DEFAULT false,
        "lockedAt" timestamptz(3),
        "failedLoginAttempts" integer NOT NULL DEFAULT 0,
        "lockExpiresAt" timestamptz(3),
        "lastFailedLoginAt" timestamptz(3),
        "lastLoginAt" timestamptz(3),
        "lastLoginIp" varchar(45),
        "twoFactorSecret" text,
        "isTwoFactorEnabled" boolean NOT NULL DEFAULT false,
        "twoFactorVerifiedAt" timestamptz(3),
        "passwordChangedAt" timestamptz(3),
        "forcePasswordChange" boolean NOT NULL DEFAULT false,
        "refreshTokenHash" varchar(255),
        "tokenVersion" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
        "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id),
        CONSTRAINT "chk_users_username_normalized"
          CHECK (username = LOWER(BTRIM(username))),
        CONSTRAINT "chk_users_email_normalized"
          CHECK (email = LOWER(BTRIM(email))),
        CONSTRAINT "chk_users_pending_email_normalized"
          CHECK ("pendingEmail" IS NULL OR "pendingEmail" = LOWER(BTRIM("pendingEmail"))),
        CONSTRAINT "chk_users_failed_login_attempts_non_negative"
          CHECK ("failedLoginAttempts" >= 0),
        CONSTRAINT "chk_users_token_version_non_negative"
          CHECK ("tokenVersion" >= 0)
      )`,
      `CREATE TABLE public.auth_sessions (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "tokenHash" varchar(64) NOT NULL,
        "familyId" varchar(64) NOT NULL,
        "expiresAt" timestamptz(3) NOT NULL,
        "revokedAt" timestamptz(3),
        "revokeReason" varchar(100),
        ip varchar(45),
        "userAgent" varchar(1024),
        "lastUsedAt" timestamptz(3),
        "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
        "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_641507381f32580e8479efc36cd" PRIMARY KEY (id),
        CONSTRAINT "chk_auth_sessions_token_hash"
          CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "chk_auth_sessions_family_id_not_blank"
          CHECK (LENGTH(BTRIM("familyId")) > 0)
      )`,
      `CREATE TABLE public.auth_tokens (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "tokenHash" varchar(64) NOT NULL,
        purpose varchar(30) NOT NULL,
        "expiresAt" timestamptz(3) NOT NULL,
        "consumedAt" timestamptz(3),
        "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_41e9ddfbb32da18c4e85e45c2fd" PRIMARY KEY (id),
        CONSTRAINT "chk_auth_tokens_token_hash"
          CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "chk_auth_tokens_purpose"
          CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'INVITATION', 'MFA_LOGIN'))
      )`,
      `CREATE TABLE public.login_attempts (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid,
        "identifierHash" varchar(64) NOT NULL,
        ip varchar(45) NOT NULL,
        "userAgent" varchar(1024),
        result varchar(20) NOT NULL,
        reason varchar(64),
        "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_070e613c8f768b1a70742705c5b" PRIMARY KEY (id),
        CONSTRAINT "chk_login_attempt_identifier_hash"
          CHECK ("identifierHash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "chk_login_attempt_result"
          CHECK (result IN ('SUCCESS', 'FAILURE', 'LOCKED', 'MFA_REQUIRED'))
      )`,
      `CREATE TABLE public.audit_logs (
        id bigserial NOT NULL,
        level public.audit_log_level_enum NOT NULL DEFAULT 'info',
        category varchar(100) NOT NULL DEFAULT 'application',
        message text NOT NULL,
        method varchar(16),
        url text,
        "statusCode" smallint,
        "durationMs" integer,
        "requestId" varchar(100),
        "traceId" varchar(100),
        "userId" uuid,
        "ipAddress" varchar(64),
        "userAgent" text,
        device jsonb,
        "errorName" varchar(255),
        "errorStack" text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY (id)
      )`,
      `CREATE TABLE public.projects (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        slug varchar(150) NOT NULL,
        code varchar(20) NOT NULL,
        name varchar(200) NOT NULL,
        category varchar(100) NOT NULL,
        headline varchar(500) NOT NULL,
        description text NOT NULL,
        link varchar(1000),
        "linkLabel" varchar(150),
        "imageUrl" varchar(1000),
        featured boolean NOT NULL DEFAULT false,
        active boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY (id)
      )`,
      `CREATE TABLE public.technologies (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        slug varchar(150) NOT NULL,
        name varchar(150) NOT NULL,
        category public.technologies_category_enum NOT NULL,
        description text,
        "websiteUrl" varchar(1000),
        "logoUrl" varchar(1000),
        active boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        CONSTRAINT "PK_9a97465b79568f00becacdd4e4a" PRIMARY KEY (id)
      )`,
      `CREATE TABLE public.roles_permissions (
        "roleId" uuid NOT NULL,
        "permissionId" uuid NOT NULL,
        CONSTRAINT "PK_5829481fc2a13d85b9b6bf3bd53"
          PRIMARY KEY ("roleId", "permissionId")
      )`,
      `CREATE TABLE public.users_roles (
        "userId" uuid NOT NULL,
        "roleId" uuid NOT NULL,
        CONSTRAINT "PK_a472bd14ea5d26f611025418d57"
          PRIMARY KEY ("userId", "roleId")
      )`,
      `CREATE TABLE public.project_technologies (
        project_id uuid NOT NULL,
        technology_id uuid NOT NULL,
        CONSTRAINT "PK_9ce440f9d20169452245a0ca6d9"
          PRIMARY KEY (project_id, technology_id)
      )`,
      `CREATE UNIQUE INDEX "UQ_notifications_idempotency_key"
        ON public.notifications ("idempotencyKey")
        WHERE "idempotencyKey" IS NOT NULL`,
      `CREATE INDEX "IDX_notifications_channel" ON public.notifications (channel)`,
      `CREATE INDEX "IDX_notifications_status" ON public.notifications (status)`,
      `CREATE INDEX "IDX_notifications_recipient" ON public.notifications (recipient)`,
      `CREATE INDEX "IDX_notifications_created_at" ON public.notifications ("createdAt")`,
      `CREATE INDEX "IDX_notifications_source_service" ON public.notifications ("sourceService")`,
      `CREATE UNIQUE INDEX "uq_permissions_name" ON public.permissions (name)`,
      `CREATE UNIQUE INDEX "uq_roles_name" ON public.roles (name)`,
      `CREATE UNIQUE INDEX "uq_users_username" ON public.users (username)`,
      `CREATE UNIQUE INDEX "uq_users_email" ON public.users (email)`,
      `CREATE UNIQUE INDEX "uq_users_pending_email" ON public.users ("pendingEmail")`,
      `CREATE INDEX "idx_users_status_locked" ON public.users (status, "isLocked")`,
      `CREATE INDEX "idx_users_created_at" ON public.users ("createdAt")`,
      `CREATE UNIQUE INDEX "uq_auth_sessions_token_hash" ON public.auth_sessions ("tokenHash")`,
      `CREATE INDEX "idx_auth_sessions_user_revoked" ON public.auth_sessions ("userId", "revokedAt")`,
      `CREATE INDEX "idx_auth_sessions_user_expires" ON public.auth_sessions ("userId", "expiresAt")`,
      `CREATE INDEX "idx_auth_sessions_family" ON public.auth_sessions ("familyId")`,
      `CREATE INDEX "idx_auth_sessions_family_revoked" ON public.auth_sessions ("familyId", "revokedAt")`,
      `CREATE INDEX "idx_auth_sessions_expires_at" ON public.auth_sessions ("expiresAt")`,
      `CREATE UNIQUE INDEX "uq_auth_tokens_token_hash" ON public.auth_tokens ("tokenHash")`,
      `CREATE INDEX "idx_auth_tokens_user_purpose_consumed"
        ON public.auth_tokens ("userId", purpose, "consumedAt")`,
      `CREATE INDEX "idx_auth_tokens_expires_at" ON public.auth_tokens ("expiresAt")`,
      `CREATE INDEX "idx_auth_tokens_created_at" ON public.auth_tokens ("createdAt")`,
      `CREATE INDEX "idx_login_attempts_identifier_created"
        ON public.login_attempts ("identifierHash", "createdAt")`,
      `CREATE INDEX "idx_login_attempts_ip_created"
        ON public.login_attempts (ip, "createdAt")`,
      `CREATE INDEX "idx_login_attempts_user_created"
        ON public.login_attempts ("userId", "createdAt")`,
      `CREATE INDEX "idx_login_attempts_result_created"
        ON public.login_attempts (result, "createdAt")`,
      `CREATE INDEX "idx_login_attempts_created_at" ON public.login_attempts ("createdAt")`,
      `CREATE INDEX "idx_audit_logs_level_created_at"
        ON public.audit_logs (level, "createdAt")`,
      `CREATE INDEX "idx_audit_logs_category_created_at"
        ON public.audit_logs (category, "createdAt")`,
      `CREATE INDEX "idx_audit_logs_user_created_at"
        ON public.audit_logs ("userId", "createdAt")`,
      `CREATE INDEX "idx_audit_logs_request_id" ON public.audit_logs ("requestId")`,
      `CREATE INDEX "idx_audit_logs_trace_id" ON public.audit_logs ("traceId")`,
      `CREATE INDEX "idx_audit_logs_created_at" ON public.audit_logs ("createdAt")`,
      `CREATE UNIQUE INDEX "IDX_96e045ab8b0271e5f5a91eae1e" ON public.projects (slug)`,
      `CREATE UNIQUE INDEX "IDX_e1b296cd0df9807f28db43bcab" ON public.technologies (slug)`,
      `CREATE INDEX "IDX_28bf280551eb9aa82daf1e156d" ON public.roles_permissions ("roleId")`,
      `CREATE INDEX "IDX_31cf5c31d0096f706e3ba3b1e8" ON public.roles_permissions ("permissionId")`,
      `CREATE INDEX "IDX_776b7cf9330802e5ef5a8fb18d" ON public.users_roles ("userId")`,
      `CREATE INDEX "IDX_4fb14631257670efa14b15a3d8" ON public.users_roles ("roleId")`,
      `CREATE INDEX "IDX_f47224297940ea91297f9aaa89" ON public.project_technologies (project_id)`,
      `CREATE INDEX "IDX_76db2dc46856d239349e74e761" ON public.project_technologies (technology_id)`,
      `ALTER TABLE public.auth_sessions
        ADD CONSTRAINT "FK_925b24d7fc2f9324ce972aee025"
          FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE`,
      `ALTER TABLE public.auth_tokens
        ADD CONSTRAINT "FK_c25fb956ebada4b256501585cca"
          FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE`,
      `ALTER TABLE public.roles_permissions
        ADD CONSTRAINT "FK_28bf280551eb9aa82daf1e156d9"
          FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON DELETE CASCADE`,
      `ALTER TABLE public.roles_permissions
        ADD CONSTRAINT "FK_31cf5c31d0096f706e3ba3b1e82"
          FOREIGN KEY ("permissionId") REFERENCES public.permissions(id) ON DELETE CASCADE`,
      `ALTER TABLE public.users_roles
        ADD CONSTRAINT "FK_776b7cf9330802e5ef5a8fb18dc"
          FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE`,
      `ALTER TABLE public.users_roles
        ADD CONSTRAINT "FK_4fb14631257670efa14b15a3d86"
          FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON DELETE CASCADE`,
      `ALTER TABLE public.project_technologies
        ADD CONSTRAINT "FK_f47224297940ea91297f9aaa898"
          FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE`,
      `ALTER TABLE public.project_technologies
        ADD CONSTRAINT "FK_76db2dc46856d239349e74e761b"
          FOREIGN KEY (technology_id) REFERENCES public.technologies(id) ON DELETE CASCADE`,
    ];
    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }
  async down() {
    throw new Error(
      'Application schema rollback requires a reviewed manual plan.',
    );
  }
}
exports.CreateApplicationSchema1790812800000 =
  CreateApplicationSchema1790812800000;
