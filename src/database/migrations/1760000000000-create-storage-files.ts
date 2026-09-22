import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStorageFiles1760000000000 implements MigrationInterface {
  name = 'CreateStorageFiles1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "storage_files" ("id" uuid NOT NULL, "storageType" character varying NOT NULL, "fileType" character varying NOT NULL, "originalName" character varying(255), "storageKey" text, "url" text NOT NULL, "mimeType" character varying(255), "fileSize" bigint, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_storage_files_storage_key" UNIQUE ("storageKey"), CONSTRAINT "PK_storage_files_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_storage_files_type_created_at" ON "storage_files" ("fileType", "createdAt")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_storage_files_type_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "storage_files"`);
  }
}
