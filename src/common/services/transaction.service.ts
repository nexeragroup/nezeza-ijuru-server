import { Injectable } from '@nestjs/common';

import { DataSource, EntityManager, QueryRunner } from 'typeorm';

export type TransactionIsolationLevel =
  'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

const DEFAULT_ISOLATION_LEVEL: TransactionIsolationLevel = 'READ COMMITTED';

@Injectable()
export class TransactionService {
  constructor(private readonly dataSource: DataSource) {}

  run<T>(
    work: (manager: EntityManager) => Promise<T>,

    isolationLevel: TransactionIsolationLevel = DEFAULT_ISOLATION_LEVEL,
  ): Promise<T> {
    return this.dataSource.transaction(isolationLevel, work);
  }

  /**
   * Prefer run() whenever possible.
   *
   * start() exists for workflows where the transaction
   * lifecycle must span multiple service calls.
   *
   * Every database operation must use runner.manager.
   */
  async start(
    isolationLevel: TransactionIsolationLevel = DEFAULT_ISOLATION_LEVEL,
  ): Promise<QueryRunner> {
    const runner = this.dataSource.createQueryRunner('master');

    try {
      await runner.connect();

      await runner.startTransaction(isolationLevel);

      return runner;
    } catch (error) {
      const cleanupErrors: unknown[] = [];

      try {
        if (!runner.isReleased) {
          await runner.release();
        }
      } catch (releaseError) {
        cleanupErrors.push(releaseError);
      }

      if (cleanupErrors.length) {
        throw new AggregateError(
          [error, ...cleanupErrors],

          'Failed to start transaction and clean up QueryRunner',
        );
      }

      throw error;
    }
  }

  /**
   * Commits and always releases the QueryRunner.
   *
   * If commit fails, rollback is attempted automatically.
   */
  async commit(runner: QueryRunner): Promise<void> {
    this.assertRunnerAvailable(runner);

    try {
      await runner.commitTransaction();
    } catch (commitError) {
      const errors: unknown[] = [commitError];

      try {
        if (runner.isTransactionActive) {
          await runner.rollbackTransaction();
        }
      } catch (rollbackError) {
        errors.push(rollbackError);
      }

      try {
        if (!runner.isReleased) {
          await runner.release();
        }
      } catch (releaseError) {
        errors.push(releaseError);
      }

      if (errors.length > 1) {
        throw new AggregateError(
          errors,
          'Transaction commit failed and cleanup also encountered errors',
        );
      }

      throw commitError;
    }

    await runner.release();
  }

  /**
   * Safe to call from a catch block.
   *
   * Rolls back an active transaction and releases
   * the QueryRunner.
   */
  async rollback(runner: QueryRunner): Promise<void> {
    if (runner.isReleased) {
      return;
    }

    const errors: unknown[] = [];

    try {
      if (runner.isTransactionActive) {
        await runner.rollbackTransaction();
      }
    } catch (rollbackError) {
      errors.push(rollbackError);
    }

    try {
      if (!runner.isReleased) {
        await runner.release();
      }
    } catch (releaseError) {
      errors.push(releaseError);
    }

    if (errors.length === 1) {
      throw errors[0];
    }

    if (errors.length > 1) {
      throw new AggregateError(
        errors,
        'Transaction rollback and QueryRunner cleanup failed',
      );
    }
  }

  private assertRunnerAvailable(runner: QueryRunner): void {
    if (runner.isReleased) {
      throw new Error('QueryRunner has already been released');
    }

    if (!runner.isTransactionActive) {
      throw new Error('QueryRunner does not have an active transaction');
    }
  }
}
