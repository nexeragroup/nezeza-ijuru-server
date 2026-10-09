import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConferenceSoftDelete1791558717000
  implements MigrationInterface
{
  name = 'AddConferenceSoftDelete1791558717000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "conferences" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP WITH TIME ZONE',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "conferences" DROP COLUMN IF EXISTS "deletedAt"',
    );
  }
}
