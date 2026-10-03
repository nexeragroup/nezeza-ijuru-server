const fs = require('node:fs');
const path = require('node:path');
const { DataSource } = require('typeorm');

const root = path.resolve(__dirname, '..');

function loadEnvironmentFile(file) {
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;

    const separator = value.indexOf('=');
    if (separator === -1) continue;

    const key = value.slice(0, separator).trim();
    let entry = value.slice(separator + 1).trim();
    if (
      entry.length >= 2 &&
      ((entry.startsWith('"') && entry.endsWith('"')) ||
        (entry.startsWith("'") && entry.endsWith("'")))
    ) {
      entry = entry.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = entry;
  }
}

function loadEnvironment() {
  const environment = process.env.NODE_ENV ?? 'development';
  const environmentFile =
    { development: 'dev', staging: 'staging', production: 'prod' }[
      environment
    ] ?? environment;

  loadEnvironmentFile(path.join(root, `.env.${environmentFile}`));
  loadEnvironmentFile(path.join(root, '.env'));
}

async function main() {
  loadEnvironment();

  const ssl = process.env.DATABASE_SSL === 'true';
  const source = new DataSource({
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
    migrations: [path.join(root, 'dist/database/migrations/*.js')],
  });

  try {
    await source.initialize();
    const applied = await source.runMigrations({ transaction: 'all' });
    console.log(`Applied ${applied.length} database migration(s).`);
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}

void main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
