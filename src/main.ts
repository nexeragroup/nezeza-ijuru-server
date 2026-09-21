import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import {
  configureHttpApplication,
  type HttpApplicationConfiguration,
} from './bootstrap';

type ProcessRole = 'api' | 'worker' | 'all';

const bootstrapLogger = new Logger('Bootstrap');

/*
 * ------------------------------------------------------------------
 * Formatting helpers
 * ------------------------------------------------------------------
 */

function formatStatus(enabled: boolean): string {
  return enabled ? '✅ Enabled' : '❌ Disabled';
}

function formatConfiguration(configured: boolean): string {
  return configured ? '✅ Configured' : '⚠️ Not configured';
}

function formatValue(
  value: string | number | boolean | null | undefined,
  fallback = 'Not configured',
): string {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return String(value);
}

/*
 * ------------------------------------------------------------------
 * HTTP startup banner
 * ------------------------------------------------------------------
 */

function createStartupBanner(
  config: ConfigService,
  port: number,
  host: string,
  http: HttpApplicationConfiguration,
): string {
  const environment = config.get<string>(
    'app.environment',
    process.env.NODE_ENV ?? 'development',
  );

  const role = config.get<string>('app.role', process.env.APP_ROLE ?? 'all');

  const applicationName = config.get<string>('app.name', 'Centralized API');

  const applicationVersion = config.get<string>('app.version', '0.0.0');

  /*
   * 0.0.0.0 / :: are bind addresses, not useful browser URLs.
   */
  const localHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;

  const baseUrl = config.get<string>(
    'app.publicUrl',
    `http://${localHost}:${port}`,
  );

  const corsOrigins = normalizeStringArray(
    config.get<string[] | string>('cors.origins', []),
  );

  const swaggerAuthEnabled =
    config.get<boolean>('swagger.authEnabled') ??
    config.get<boolean>('SWAGGER_AUTH_ENABLED', false);

  const databaseEnabled = config.get<boolean>('database.enabled', true);

  const cacheEnabled = config.get<boolean>('cache.enabled', true);

  const queueEnabled = config.get<boolean>('queue.enabled', true);

  const outboxEnabled = config.get<boolean>('outbox.enabled', true);

  const storageEnabled = config.get<boolean>('storage.enabled', false);

  const trustProxyHops = config.get<number>(
    'security.trustProxyHops',
    config.get<boolean>('security.trustProxy', false) ? 1 : 0,
  );

  const secureCookies = config.get<boolean>('security.secureCookies', false);

  const sameSite = config.get<string>('security.cookieSameSite', 'lax');

  const apiUrl = `${baseUrl}${http.apiPath}`;

  const healthUrl = `${apiUrl}/health`;

  return [
    '',

    '╔══════════════════════════════════════════════════════════════╗',
    '║                 🚀 CENTRALIZED API                           ║',
    '╚══════════════════════════════════════════════════════════════╝',

    '',

    '     📦 APPLICATION',
    '────────────────────────────────────────────────────────────────',

    `     🏷️  Name            : ${applicationName}`,
    `     📌 Version         : ${applicationVersion}`,
    `     🌍 Environment     : ${environment}`,
    `     ⚙️  Process role    : ${role}`,
    `     🧩 Process ID      : ${process.pid}`,
    `     🟢 Node.js         : ${process.version}`,
    `     🖥️  Bind host       : ${host}`,
    `     🔌 Port            : ${port}`,
    `     🔗 Base URL        : ${baseUrl}`,
    `     🛣️  API prefix      : ${http.apiPath}`,

    '',

    '     🗄️  DATABASE',
    '────────────────────────────────────────────────────────────────',

    `     ⚡ Status          : ${formatStatus(databaseEnabled)}`,

    '     🐘 Engine          : PostgreSQL',

    `     📚 Database        : ${formatValue(
      config.get<string>('database.name'),
      'centralized_api',
    )}`,

    `     🖥️  Host            : ${formatValue(
      config.get<string>('database.host'),
      'localhost',
    )}`,

    `     🔌 Port            : ${formatValue(
      config.get<number>('database.port'),
      '5432',
    )}`,

    `     🔐 SSL             : ${formatStatus(
      config.get<boolean>('database.ssl', false),
    )}`,

    `     🔄 Synchronize     : ${formatStatus(
      config.get<boolean>('database.synchronize', false),
    )}`,

    `     📜 Migrations run  : ${formatStatus(
      config.get<boolean>('database.migrationsRun', false),
    )}`,

    '',

    '     ⚡ REDIS / CACHE',
    '────────────────────────────────────────────────────────────────',

    `     🧠 Cache           : ${formatStatus(cacheEnabled)}`,

    `     🖥️  Redis host      : ${formatValue(
      config.get<string>('redis.host'),
      'localhost',
    )}`,

    `     🔌 Redis port      : ${formatValue(
      config.get<number>('redis.port'),
      '6379',
    )}`,

    `     🔐 Redis TLS       : ${formatStatus(
      config.get<boolean>('redis.tls', false),
    )}`,

    `     🏷️  Namespace       : ${formatValue(
      config.get<string>('redis.namespace'),
      'centralized-api',
    )}`,

    '',

    '     📨 QUEUE / EVENTS',
    '────────────────────────────────────────────────────────────────',

    `     📬 Queue           : ${formatStatus(queueEnabled)}`,

    `     📤 Outbox          : ${formatStatus(outboxEnabled)}`,

    `     📋 Event queue     : ${formatValue(
      config.get<string>('queue.eventQueueName'),
      'events.v1',
    )}`,

    `     ☠️  Dead letter     : ${formatValue(
      config.get<string>('queue.deadLetterQueueName'),
      'events.dlq.v1',
    )}`,

    `     👷 Concurrency     : ${formatValue(
      config.get<number>('queue.concurrency'),
      '5',
    )}`,

    '',

    '     🗂️  OBJECT STORAGE',
    '────────────────────────────────────────────────────────────────',

    `     📦 Status          : ${formatStatus(storageEnabled)}`,

    `     🪣 Bucket          : ${
      storageEnabled
        ? formatValue(config.get<string>('storage.bucket'))
        : '➖ Not enabled'
    }`,

    `     🌍 Region          : ${
      storageEnabled
        ? formatValue(config.get<string>('storage.region'), 'us-east-1')
        : '➖ Not enabled'
    }`,

    '',

    '     🛡️  SECURITY',
    '────────────────────────────────────────────────────────────────',

    `     ⛑️  Helmet          : ${formatStatus(
      config.get<boolean>('security.helmetEnabled', true),
    )}`,

    `     🌐 CORS            : ${formatConfiguration(corsOrigins.length > 0)}`,

    `     🍪 Secure cookies  : ${formatStatus(secureCookies)}`,

    `     🍪 SameSite        : ${sameSite}`,

    `     🔀 Proxy hops      : ${trustProxyHops}`,

    `     🔑 Swagger auth    : ${
      http.swaggerPath ? formatStatus(swaggerAuthEnabled) : '➖ Unavailable'
    }`,

    '     ✅ Validation      : Whitelist + strict + transformation',

    '',

    '     🔗 ENDPOINTS',
    '────────────────────────────────────────────────────────────────',

    `     🏠 API             : ${apiUrl}`,
    `     💚 Health          : ${healthUrl}`,

    '',

    ...(corsOrigins.length > 0
      ? [
          '     🌍 CORS ORIGINS',
          '────────────────────────────────────────────────────────────────',

          ...corsOrigins.map((origin) => `      ✅ ${origin}`),

          '',
        ]
      : [
          '     🌍 CORS ORIGINS',
          '────────────────────────────────────────────────────────────────',
          '     ⚠️  No cross-origin browser origins configured',
          '',
        ]),

    '     📖 SWAGGER',
    '────────────────────────────────────────────────────────────────',

    ...(http.swaggerPath
      ? [
          `     🖥️  Swagger UI      : ${baseUrl}${http.swaggerPath}`,

          `     📄 OpenAPI JSON    : ${baseUrl}${http.swaggerPath}-json`,

          `     📝 OpenAPI YAML    : ${baseUrl}${http.swaggerPath}-yaml`,

          `     🔐 Authentication  : ${formatStatus(swaggerAuthEnabled)}`,
        ]
      : ['      ❌ Status          : Disabled']),

    '',

    '════════════════════════════════════════════════════════════════',

    `     ✅ ${applicationName} is running successfully`,

    `     🔗 ${apiUrl}`,

    '════════════════════════════════════════════════════════════════',

    '',
  ].join('\n');
}

/*
 * ------------------------------------------------------------------
 * Worker startup banner
 * ------------------------------------------------------------------
 */

function createWorkerBanner(config: ConfigService, role: ProcessRole): string {
  const applicationName = config.get<string>('app.name', 'Centralized API');

  const applicationVersion = config.get<string>('app.version', '0.0.0');

  const environment = config.get<string>(
    'app.environment',
    process.env.NODE_ENV ?? 'development',
  );

  return [
    '',

    '╔══════════════════════════════════════════════════════════════╗',
    '║                 ⚙️ CENTRALIZED API WORKER                    ║',
    '╚══════════════════════════════════════════════════════════════╝',

    '',

    '     📦 APPLICATION',
    '────────────────────────────────────────────────────────────────',

    `     🏷️  Name            : ${applicationName}`,
    `     📌 Version         : ${applicationVersion}`,
    `     🌍 Environment     : ${environment}`,
    `     ⚙️  Process role    : ${role}`,
    `     🧩 Process ID      : ${process.pid}`,
    `     🟢 Node.js         : ${process.version}`,

    '',

    '     🗄️  DATABASE',
    '────────────────────────────────────────────────────────────────',

    `     ⚡ Status          : ${formatStatus(
      config.get<boolean>('database.enabled', true),
    )}`,

    `     📚 Database        : ${formatValue(
      config.get<string>('database.name'),
      'centralized_api',
    )}`,

    `     🖥️  Host            : ${formatValue(
      config.get<string>('database.host'),
      'localhost',
    )}`,

    `     🔌 Port            : ${formatValue(
      config.get<number>('database.port'),
      '5432',
    )}`,

    `     🔐 SSL             : ${formatStatus(
      config.get<boolean>('database.ssl', false),
    )}`,

    '',

    '     ⚡ REDIS',
    '────────────────────────────────────────────────────────────────',

    `     🖥️  Host            : ${formatValue(
      config.get<string>('redis.host'),
      'localhost',
    )}`,

    `     🔌 Port            : ${formatValue(
      config.get<number>('redis.port'),
      '6379',
    )}`,

    `     🔐 TLS             : ${formatStatus(
      config.get<boolean>('redis.tls', false),
    )}`,

    `     🏷️  Namespace       : ${formatValue(
      config.get<string>('redis.namespace'),
      'centralized-api',
    )}`,

    '',

    '     📨 QUEUE / OUTBOX',
    '────────────────────────────────────────────────────────────────',

    `     📬 Queue           : ${formatStatus(
      config.get<boolean>('queue.enabled', true),
    )}`,

    `     📤 Outbox          : ${formatStatus(
      config.get<boolean>('outbox.enabled', true),
    )}`,

    `     📋 Event queue     : ${formatValue(
      config.get<string>('queue.eventQueueName'),
      'events.v1',
    )}`,

    `     ☠️  Dead letter     : ${formatValue(
      config.get<string>('queue.deadLetterQueueName'),
      'events.dlq.v1',
    )}`,

    `     👷 Concurrency     : ${formatValue(
      config.get<number>('queue.concurrency'),
      '5',
    )}`,

    `     🔁 Attempts        : ${formatValue(
      config.get<number>('queue.attempts'),
      '5',
    )}`,

    '',

    '     ⚙️  WORKER',
    '────────────────────────────────────────────────────────────────',

    '     ✅ Status          : Running',

    `     ⏱️  Outbox poll     : ${formatValue(
      config.get<number>('outbox.pollIntervalMs'),
      '1000',
    )} ms`,

    `     📦 Outbox batch    : ${formatValue(
      config.get<number>('outbox.batchSize'),
      '50',
    )}`,

    `     🔒 Lease duration  : ${formatValue(
      config.get<number>('outbox.leaseDurationMs'),
      '30000',
    )} ms`,

    '',

    '════════════════════════════════════════════════════════════════',
    '     ✅ Worker infrastructure is running',
    '════════════════════════════════════════════════════════════════',

    '',
  ].join('\n');
}

/*
 * ------------------------------------------------------------------
 * Startup failure banner
 * ------------------------------------------------------------------
 */

function createStartupFailureBanner(error: unknown): string {
  const normalizedError =
    error instanceof Error ? error : new Error(String(error));

  return [
    '',

    '╔══════════════════════════════════════════════════════════════╗',
    '║              ❌ CENTRALIZED API STARTUP FAILED               ║',
    '╚══════════════════════════════════════════════════════════════╝',

    '',

    `💥 Error           : ${normalizedError.message}`,
    `🧩 Process ID      : ${process.pid}`,
    `🟢 Node.js         : ${process.version}`,
    `⚙️  Process role    : ${process.env.APP_ROLE ?? 'all'}`,
    `🌍 Environment     : ${process.env.NODE_ENV ?? 'development'}`,

    '',

    '🔍 POSSIBLE CAUSES',
    '────────────────────────────────────────────────────────────────',

    '🗄️  Database is unavailable',
    '⚡ Redis is unavailable',
    '📨 Queue infrastructure failed to initialize',
    '⚙️  Environment configuration is invalid',
    '🔌 Application port is already in use',
    '🔑 Required credentials or encryption keys are missing',
    '🍪 Session configuration is invalid',
    '🌐 Network connection is unavailable',
    '📦 Object storage configuration is invalid',

    '',

    '💡 Check the configuration, infrastructure connections,',
    '   credentials, logs, and application port before restarting.',

    '',

    '════════════════════════════════════════════════════════════════',

    '',
  ].join('\n');
}

/*
 * ------------------------------------------------------------------
 * Bootstrap
 * ------------------------------------------------------------------
 */

async function bootstrap(): Promise<void> {
  const role = getProcessRole();

  if (role === 'worker') {
    await bootstrapWorker(role);

    return;
  }

  await bootstrapHttpApplication(role);
}

async function bootstrapHttpApplication(role: ProcessRole): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: true,
  });

  const config = app.get(ConfigService);

  const port = getPort(config);

  const host = getHost(config);

  const http = configureHttpApplication(app);

  await app.listen(port, host);

  bootstrapLogger.log(createStartupBanner(config, port, host, http));

  /*
   * Additional structured event for log collectors.
   *
   * The detailed human-readable terminal banner remains
   * available above.
   */
  bootstrapLogger.debug({
    event: 'application_started',

    application: config.get<string>('app.name', 'centralized-api'),

    role,

    environment: config.get<string>('app.environment', 'development'),

    pid: process.pid,

    host,
    port,

    apiPath: http.apiPath,

    swaggerPath: http.swaggerPath ?? null,
  });
}

async function bootstrapWorker(role: ProcessRole): Promise<void> {
  const context = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: true,
  });

  context.enableShutdownHooks(['SIGINT', 'SIGTERM']);

  const config = context.get(ConfigService);

  bootstrapLogger.log(createWorkerBanner(config, role));

  bootstrapLogger.debug({
    event: 'worker_started',

    application: config.get<string>('app.name', 'centralized-api'),

    role,

    environment: config.get<string>('app.environment', 'development'),

    pid: process.pid,
  });
}

/*
 * ------------------------------------------------------------------
 * Configuration validation
 * ------------------------------------------------------------------
 */

function getProcessRole(): ProcessRole {
  const role = (process.env.APP_ROLE ?? 'all').trim().toLowerCase();

  if (role !== 'api' && role !== 'worker' && role !== 'all') {
    throw new Error(
      `Invalid APP_ROLE "${role}". Expected "api", "worker", or "all".`,
    );
  }

  return role;
}

function getPort(config: ConfigService): number {
  const port = config.get<number>('app.port', 3000);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('app.port must be an integer between 1 and 65535');
  }

  return port;
}

function getHost(config: ConfigService): string {
  const host = config.get<string>('app.host', '0.0.0.0').trim();

  if (!host) {
    throw new Error('app.host cannot be empty');
  }

  return host;
}

function normalizeStringArray(value: string[] | string | undefined): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))];
}

/*
 * ------------------------------------------------------------------
 * Start application
 * ------------------------------------------------------------------
 */

void bootstrap().catch((error: unknown) => {
  const normalizedError =
    error instanceof Error ? error : new Error(String(error));

  bootstrapLogger.error(
    createStartupFailureBanner(normalizedError),

    normalizedError.stack,
  );

  /*
   * Bootstrap failure means the process is not healthy enough
   * to serve traffic or process jobs.
   */
  process.exitCode = 1;
});
