// @ts-nocheck
// Restored from the last verified compiled migration artifact.
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.NormalizePermissionNames1790985601000 = void 0;
class NormalizePermissionNames1790985601000 {
  name = 'NormalizePermissionNames1790985601000';
  async up(queryRunner) {
    await queryRunner.query(`DO $$ BEGIN
        IF EXISTS (
          SELECT 1
          FROM public.permissions
          GROUP BY LOWER(BTRIM(name))
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION
            'Cannot normalize permission names because case-insensitive duplicates exist';
        END IF;
      END $$`);
    await queryRunner.query(`ALTER TABLE public.permissions
        DROP CONSTRAINT IF EXISTS "chk_permissions_name_canonical"`);
    await queryRunner.query(`UPDATE public.permissions
        SET name = LOWER(BTRIM(name))
        WHERE name IS DISTINCT FROM LOWER(BTRIM(name))`);
    await queryRunner.query(`ALTER TABLE public.permissions
        ADD CONSTRAINT "chk_permissions_name_canonical"
          CHECK (name = LOWER(BTRIM(name)))`);
  }
  async down(queryRunner) {
    await queryRunner.query(`ALTER TABLE public.permissions
        DROP CONSTRAINT IF EXISTS "chk_permissions_name_canonical"`);
    await queryRunner.query(`UPDATE public.permissions
        SET name = UPPER(BTRIM(name))
        WHERE name IS DISTINCT FROM UPPER(BTRIM(name))`);
    await queryRunner.query(`ALTER TABLE public.permissions
        ADD CONSTRAINT "chk_permissions_name_canonical"
          CHECK (name = UPPER(BTRIM(name)))`);
  }
}
exports.NormalizePermissionNames1790985601000 =
  NormalizePermissionNames1790985601000;
