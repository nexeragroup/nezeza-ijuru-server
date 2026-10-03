// Uses disposable databases only. It never connects to the application database.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { Client } = require('pg');
const { DataSource } = require('typeorm');

const root = path.resolve(__dirname, '..');
const connection = {
  host: process.env.MIGRATION_TEST_HOST || '127.0.0.1',
  port: Number(process.env.MIGRATION_TEST_PORT || 5432),
  user: process.env.MIGRATION_TEST_USER || process.env.USER,
  password: process.env.MIGRATION_TEST_PASSWORD,
};

async function checkScenario(admin, upgrade) {
  const database = `nexera_migration_test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${database}"`);

  const source = new DataSource({
    type: 'postgres',
    host: connection.host,
    port: connection.port,
    username: connection.user,
    password: connection.password,
    database,
    uuidExtension: 'pgcrypto',
    synchronize: false,
    entities: [root + '/dist/**/*.entity.js'],
    migrations: [root + '/dist/database/migrations/*.js'],
  });

  try {
    await source.initialize();

    if (upgrade) {
      const migrations = source.migrations;
      source.migrations = migrations.slice(0, 2);
      await source.runMigrations();
      source.migrations = migrations;
      await source.query(
        `INSERT INTO outbox_events ("eventId", "eventType", "schemaVersion", payload)
         VALUES ($1, 'migration-check', 1, '{}')`,
        [randomUUID()],
      );
    }

    assert.equal(
      (await source.runMigrations()).length,
      upgrade ? source.migrations.length - 2 : source.migrations.length,
    );
    assert.equal((await source.runMigrations()).length, 0);
    assert.equal(source.entityMetadatas.length, 26);

    const drift = await source.driver.createSchemaBuilder().log();
    assert.deepEqual(
      drift.upQueries.map((query) => query.query),
      [],
      'Migration schema must match every entity, index, and relation',
    );

    await source.undoLastMigration();
    assert.equal(await source.showMigrations(), true);
    assert.equal((await source.runMigrations()).length, 1);
    const rollbackDrift = await source.driver.createSchemaBuilder().log();
    assert.deepEqual(
      rollbackDrift.upQueries.map((query) => query.query),
      [],
      'A rolled-back migration must apply cleanly again',
    );

    if (upgrade) {
      assert.equal(
        Number((await source.query('SELECT count(*) FROM outbox_events'))[0].count),
        1,
      );
    }

    const user = (
      await source.query(
        `INSERT INTO users (firstname, lastname, username, email, password)
         VALUES ('Migration', 'Check', 'migration-check', 'check@example.com', 'test-only-hash')
         RETURNING id`,
      )
    )[0];
    const tokenHash = 'a'.repeat(64);
    const sessionHash = 'b'.repeat(64);

    await source.query(
      `INSERT INTO audit_logs (message, "userId") VALUES ('migration check', $1)`,
      [user.id],
    );
    await source.query(
      `INSERT INTO auth_sessions ("userId", "tokenHash", "familyId", "expiresAt")
       VALUES ($1, $2, 'test-family', now() + interval '1 day')`,
      [user.id, sessionHash],
    );
    await source.query(
      `INSERT INTO auth_tokens ("userId", "tokenHash", purpose, "expiresAt")
       VALUES ($1, $2, 'PASSWORD_RESET', now() + interval '1 day')`,
      [user.id, tokenHash],
    );
    await source.query(
      `INSERT INTO notifications (channel, recipient, "idempotencyKey")
       VALUES ('Email', 'check@example.com', 'migration-check')`,
    );
    await assert.rejects(
      source.query(
        `INSERT INTO notifications (channel, recipient, "idempotencyKey")
         VALUES ('Email', 'check@example.com', 'migration-check')`,
      ),
      { code: '23505' },
    );

    await source.query('DELETE FROM users WHERE id = $1', [user.id]);
    assert.equal(
      Number((await source.query('SELECT count(*) FROM auth_sessions'))[0].count),
      0,
    );
    assert.equal(
      Number((await source.query('SELECT count(*) FROM auth_tokens'))[0].count),
      0,
    );
  } finally {
    if (source.isInitialized) await source.destroy();
    await admin.query(`DROP DATABASE "${database}"`);
  }
}

void (async () => {
  const admin = new Client({ ...connection, database: 'postgres' });
  await admin.connect();
  try {
    await checkScenario(admin, false);
    await checkScenario(admin, true);
  } finally {
    await admin.end();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
