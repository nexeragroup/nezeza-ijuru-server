import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConferenceProgramDates1791600000000
  implements MigrationInterface
{
  name = 'AddConferenceProgramDates1791600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "conference_programs" ADD COLUMN IF NOT EXISTS "startDate" date',
    );
    await queryRunner.query(
      'ALTER TABLE "conference_programs" ADD COLUMN IF NOT EXISTS "endDate" date',
    );
    await queryRunner.query(
      'ALTER TABLE "conference_programs" ADD CONSTRAINT "CHK_conference_programs_date_range" CHECK (("startDate" IS NULL AND "endDate" IS NULL) OR ("startDate" IS NOT NULL AND "endDate" IS NOT NULL AND "endDate" >= "startDate"))',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "conference_programs" DROP CONSTRAINT IF EXISTS "CHK_conference_programs_date_range"',
    );
    await queryRunner.query(
      'ALTER TABLE "conference_programs" DROP COLUMN IF EXISTS "endDate"',
    );
    await queryRunner.query(
      'ALTER TABLE "conference_programs" DROP COLUMN IF EXISTS "startDate"',
    );
  }
}
