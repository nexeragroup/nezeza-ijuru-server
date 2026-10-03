/*
 * Records the current migration history for a database that was created before
 * this application started managing migrations. It never changes application
 * tables. By default it is a read-only audit; pass --apply only after the
 * audit reports no schema drift.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DataSource } = require('typeorm');
const { MigrationExecutor } = require('typeorm/migration/MigrationExecutor');

const root = path.resolve(__dirname, '..');

function loadEnvironmentFile(file) {
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function createDataSource() {
  const environment = process.env.NODE_ENV ?? 'development';
  const environmentFile = {
    development: 'dev',
    staging: 'staging',
    production: 'prod',
  }[environment] ?? environment;

  loadEnvironmentFile(path.join(root, `.env.${environmentFile}`));
  loadEnvironmentFile(path.join(root, '.env'));

  const ssl = process.env.DATABASE_SSL === 'true';
  return new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    username: process.env.DATABASE_USERNAME ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? 'postgres',
    database: process.env.DATABASE_NAME ?? 'centralized_api',
    ssl: ssl
      ? {
          rejectUnauthorized:
            process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
          ca: process.env.DATABASE_SSL_CA || undefined,
        }
      : false,
    uuidExtension: 'pgcrypto',
    synchronize: false,
    entities: [path.join(root, 'dist/**/*.entity.js')],
    migrations: [path.join(root, 'dist/database/migrations/*.js')],
  });
}

async function main() {
  const apply = process.argv.includes('--apply');
  const source = createDataSource();

  try {
    await source.initialize();

    const drift = await source.driver.createSchemaBuilder().log();
    if (drift.upQueries.length > 0 || drift.downQueries.length > 0) {
      throw new Error(
        `Schema drift detected (${drift.upQueries.length} required changes, ${drift.downQueries.length} rollback changes). Refusing to baseline.`,
      );
    }

    const queryRunner = source.createQueryRunner();
    await queryRunner.connect();
    try {
      const executor = new MigrationExecutor(source, queryRunner);
      const executed = await executor.getExecutedMigrations();
      const pending = await executor.getPendingMigrations();

      if (executed.length > 0) {
        if (pending.length === 0) {
          console.log('Migration history is already complete.');
          return;
        }
        throw new Error(
          'The migrations table is only partially populated. Refusing to alter its history automatically.',
        );
      }

      if (!apply) {
        console.log(
          `Schema matches ${source.entityMetadatas.length} entities. Dry run: would record ${pending.length} migrations. Re-run with --apply to record them.`,
        );
        return;
      }

      await queryRunner.startTransaction();
      try {
        await executor.showMigrations();
        for (const migration of pending) {
          await executor.insertMigration(migration);
        }
        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      }

      console.log(`Recorded ${pending.length} migrations without changing application tables.`);
    } finally {
      await queryRunner.release();
    }
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}

void main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
