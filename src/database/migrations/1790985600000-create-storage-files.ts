// @ts-nocheck
// Restored from the last verified compiled migration artifact.
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateStorageFiles1790985600000 = void 0;
class CreateStorageFiles1790985600000 {
  name = 'CreateStorageFiles1790985600000';
  async up(queryRunner) {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.storage_files (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        "storageType" varchar NOT NULL,
        "fileType" varchar NOT NULL,
        "originalName" varchar(255),
        "storageKey" text,
        url text NOT NULL,
        "mimeType" varchar(255),
        "fileSize" bigint,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_storage_files" PRIMARY KEY (id),
        CONSTRAINT "UQ_storage_files_storage_key" UNIQUE ("storageKey")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_storage_files_type_created_at"
        ON public.storage_files ("fileType", "createdAt")`);
  }
  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS public.storage_files`);
  }
}
exports.CreateStorageFiles1790985600000 = CreateStorageFiles1790985600000;
