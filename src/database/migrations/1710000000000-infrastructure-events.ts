// @ts-nocheck
// Restored from the last verified compiled migration artifact.
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.InfrastructureEvents1710000000000 = void 0;
class InfrastructureEvents1710000000000 {
  name = 'InfrastructureEvents1710000000000';
  async up(queryRunner) {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(
      `CREATE TYPE "outbox_events_status_enum" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "outbox_events" ("eventId" uuid NOT NULL, "eventType" varchar(255) NOT NULL, "schemaVersion" integer NOT NULL, "aggregateType" varchar(255), "aggregateId" varchar(255), "payload" jsonb NOT NULL, "headers" jsonb NOT NULL DEFAULT '{}', "status" "outbox_events_status_enum" NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT 0, "availableAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "publishedAt" TIMESTAMPTZ, "claimToken" uuid, "leaseExpiresAt" TIMESTAMPTZ, "lastError" text, CONSTRAINT "PK_outbox_events" PRIMARY KEY ("eventId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_events_status_available" ON "outbox_events" ("status", "availableAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_events_lease" ON "outbox_events" ("leaseExpiresAt")`,
    );
    await queryRunner.query(
      `CREATE TABLE "processed_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "consumerName" varchar(255) NOT NULL, "eventId" uuid NOT NULL, "processedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT "PK_processed_events" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_processed_events_consumer_event" ON "processed_events" ("consumerName", "eventId")`,
    );
    await queryRunner.query(
      `CREATE TABLE "dead_letter_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "deadLetterId" varchar(255) NOT NULL, "queueName" varchar(255) NOT NULL, "jobId" varchar(255) NOT NULL, "eventId" uuid NOT NULL, "eventType" varchar(255) NOT NULL, "schemaVersion" integer NOT NULL, "payload" jsonb NOT NULL, "headers" jsonb NOT NULL DEFAULT '{}', "attempts" integer NOT NULL DEFAULT 0, "errorName" varchar(100) NOT NULL, "errorMessage" text NOT NULL, "failedAt" TIMESTAMPTZ NOT NULL, "replayedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT "PK_dead_letter_events" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dead_letter_events_id" ON "dead_letter_events" ("deadLetterId")`,
    );
  }
  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE "dead_letter_events"`);
    await queryRunner.query(`DROP TABLE "processed_events"`);
    await queryRunner.query(`DROP INDEX "IDX_outbox_events_lease"`);
    await queryRunner.query(`DROP INDEX "IDX_outbox_events_status_available"`);
    await queryRunner.query(`DROP TABLE "outbox_events"`);
    await queryRunner.query(`DROP TYPE "outbox_events_status_enum"`);
  }
}
exports.InfrastructureEvents1710000000000 = InfrastructureEvents1710000000000;
