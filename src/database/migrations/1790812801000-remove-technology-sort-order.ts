// @ts-nocheck
// Restored from the last verified compiled migration artifact.
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.RemoveTechnologySortOrder1790812801000 = void 0;
class RemoveTechnologySortOrder1790812801000 {
  name = 'RemoveTechnologySortOrder1790812801000';
  async up(queryRunner) {
    await queryRunner.query(
      `ALTER TABLE public.technologies DROP COLUMN "sortOrder"`,
    );
  }
  async down() {
    throw new Error(
      'Restoring removed sort-order data requires a reviewed manual plan.',
    );
  }
}
exports.RemoveTechnologySortOrder1790812801000 =
  RemoveTechnologySortOrder1790812801000;
