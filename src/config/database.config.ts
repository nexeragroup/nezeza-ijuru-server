import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

const databaseSettings = () => ({
  database: {
    synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
    migrations: process.env.DATABASE_MIGRATIONS === 'true',
    type: process.env.DATABASE_TYPE ?? 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    username: process.env.DATABASE_USERNAME ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? 'postgres',
    name: process.env.DATABASE_NAME ?? 'centralized_api',
    ssl: process.env.DATABASE_SSL === 'true',
    sslRejectUnauthorized:
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
    sslCa: process.env.DATABASE_SSL_CA,
    logging: process.env.DATABASE_LOGGING === 'true',
    maxConnections: Number(process.env.DATABASE_MAX_CONNECTIONS ?? 20),
    idleTimeout: Number(process.env.DATABASE_IDLE_TIMEOUT ?? 30_000),
    connectionTimeout: Number(process.env.DATABASE_CONNECTION_TIMEOUT ?? 5_000),
    replicaHost: process.env.DATABASE_REPLICA_HOST,
    replicaPort: Number(process.env.DATABASE_REPLICA_PORT ?? 5432),
    replicaUsername: process.env.DATABASE_REPLICA_USERNAME,
    replicaPassword: process.env.DATABASE_REPLICA_PASSWORD,
    replicaName: process.env.DATABASE_REPLICA_NAME,
  },
});

export default databaseSettings;

export const databaseConfig = (
  config: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  uuidExtension: 'pgcrypto',
  host: config.get<string>('database.host', 'localhost'),
  port: config.get<number>('database.port', 5432),
  username: config.get<string>('database.username', 'postgres'),
  password: config.get<string>('database.password', 'postgres'),
  database: config.get<string>('database.name', 'centralized_api'),
  ssl: config.get<boolean>('database.ssl', false)
    ? {
        rejectUnauthorized: config.get<boolean>(
          'database.sslRejectUnauthorized',
          true,
        ),
        ca: config.get<string>('database.sslCa') || undefined,
      }
    : false,
  logging: config.get<boolean>('database.logging', false),
  subscribers: [
    __dirname + '/../database/subscribers/database-audit.subscriber{.js,.ts}',
  ],
  extra: {
    max: config.get<number>('database.maxConnections', 20),
    idleTimeoutMillis: config.get<number>('database.idleTimeout', 30_000),
    connectionTimeoutMillis: config.get<number>(
      'database.connectionTimeout',
      5_000,
    ),
  },
  autoLoadEntities: true,
  synchronize: config.get<boolean>('database.synchronize', false),
  migrationsRun: config.get<boolean>('database.migrations', false),
  migrations: [__dirname + '/../database/migrations/*{.js,.ts}'],
  ...(config.get<string>('database.replicaHost') &&
  config.get<string>('database.replicaUsername')
    ? {
        replication: {
          master: {
            host: config.get<string>('database.host', 'localhost'),
            port: config.get<number>('database.port', 5432),
            username: config.get<string>('database.username', 'postgres'),
            password: config.get<string>('database.password', 'postgres'),
            database: config.get<string>('database.name', 'centralized_api'),
          },
          slaves: [
            {
              host: config.get<string>('database.replicaHost'),
              port: config.get<number>('database.replicaPort', 5432),
              username: config.get<string>('database.replicaUsername'),
              password: config.get<string>('database.replicaPassword', ''),
              database: config.get<string>(
                'database.replicaName',
                config.get<string>('database.name', 'centralized_api'),
              ),
            },
          ],
          defaultMode: 'master',
        },
      }
    : {}),
});
