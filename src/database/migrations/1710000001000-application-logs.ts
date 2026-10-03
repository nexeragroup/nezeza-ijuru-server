// @ts-nocheck
// Restored from the last verified compiled migration artifact.
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ApplicationLogs1710000001000 = void 0;
class ApplicationLogs1710000001000 {
  name = 'ApplicationLogs1710000001000';
  async up(queryRunner) {
    await queryRunner.query(
      `CREATE TYPE "application_logs_level_enum" AS ENUM ('info', 'warn', 'error', 'debug')`,
    );
    await queryRunner.query(
      `CREATE TABLE "application_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "level" "application_logs_level_enum" NOT NULL DEFAULT 'info', "category" varchar(100) NOT NULL, "message" varchar(255), "method" varchar(20), "path" text, "statusCode" integer, "durationMs" integer, "requestId" varchar(255), "userId" uuid, "ipAddress" varchar(100), "metadata" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT "PK_application_logs" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_application_logs_created_at" ON "application_logs" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_application_logs_level_created_at" ON "application_logs" ("level", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_application_logs_category_created_at" ON "application_logs" ("category", "createdAt")`,
    );
  }
  async down(queryRunner) {
    await queryRunner.query(
      `DROP INDEX "IDX_application_logs_category_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_application_logs_level_created_at"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_application_logs_created_at"`);
    await queryRunner.query(`DROP TABLE "application_logs"`);
    await queryRunner.query(`DROP TYPE "application_logs_level_enum"`);
  }
}
exports.ApplicationLogs1710000001000 = ApplicationLogs1710000001000;
