import * as Joi from 'joi';

const booleanEnv = () => Joi.boolean().truthy('true').falsy('false');

const base64Key32 = () =>
  Joi.string()
    .allow('')
    .custom((input: string, helpers) => {
      const value = input.trim();

      if (!value) {
        return '';
      }

      /*
       * Accept:
       *
       * Standard Base64:
       * AbCd...+/...=
       *
       * Base64URL:
       * AbCd...-_...
       *
       * Base64URL commonly omits "=" padding.
       */
      if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
        return helpers.error('any.invalid');
      }

      try {
        /*
         * Node's base64 decoder accepts the URL-safe
         * alphabet as well.
         */
        const decoded = Buffer.from(value, 'base64');

        if (decoded.length !== 32) {
          return helpers.error('any.invalid');
        }

        /*
         * Canonical comparison prevents malformed Base64
         * strings from being accepted simply because
         * Buffer.from() could partially decode them.
         */
        const canonical = decoded.toString('base64url');

        const suppliedCanonical = value
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/g, '');

        if (canonical !== suppliedCanonical) {
          return helpers.error('any.invalid');
        }

        return value;
      } catch {
        return helpers.error('any.invalid');
      }
    }, '32-byte encryption key validation');

const nonEmptyString = Joi.string().trim().min(1);

const namespaceSchema = Joi.string().pattern(/^[a-zA-Z0-9._-]+$/);

export const validationSchema = Joi.object({
  /*
   * ==============================================================
   * APPLICATION
   * ==============================================================
   */

  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .default('development'),

  APP_NAME: Joi.string().trim().min(1).max(120).default('centralized-api'),

  APP_VERSION: Joi.string().trim().min(1).default('0.0.1'),

  APP_ROLE: Joi.string().valid('api', 'worker', 'all').default('all'),

  HOST: Joi.string().trim().min(1).default('0.0.0.0'),

  PORT: Joi.number().port().default(3000),

  /*
   * ==============================================================
   * SWAGGER
   * ==============================================================
   */

  SWAGGER_ENABLED: booleanEnv().default(false),

  SWAGGER_PATH: Joi.string()
    .pattern(/^\/?[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/)
    .default('docs'),

  SWAGGER_AUTH_ENABLED: booleanEnv().default(false),

  SWAGGER_USERNAME: Joi.string().allow('').default(''),

  SWAGGER_PASSWORD: Joi.string().allow('').default(''),

  /*
   * ==============================================================
   * AUTHENTICATION / SECURITY
   * ==============================================================
   */

  JWT_SECRET: Joi.string().min(32).default(''),

  JWT_ACCESS_EXPIRES_IN: Joi.string()
    .pattern(/^[1-9][0-9]*(s|m|h|d)$/)
    .default('15m'),

  JWT_REFRESH_EXPIRES_IN: Joi.string()
    .pattern(/^[1-9][0-9]*(s|m|h|d)$/)
    .default('7d'),

  SESSION_SECRET: Joi.string()
    .min(32)
    .default(''),

  CSRF_SECRET: Joi.string()
    .min(32)
    .default(''),

  DISABLE_POST_CSRF: booleanEnv().default(false),

  MFA_ENCRYPTION_KEY: base64Key32().default(''),

  MFA_ENCRYPTION_KEY_ID: Joi.string()
    .trim()
    .pattern(/^[A-Za-z0-9_-]{1,64}$/)
    .default('primary'),

  /*
   * Format:
   *
   * key-id:base64,key-id-2:base64
   *
   * Detailed key validation is also performed by
   * SecretProtectionService during startup.
   */
  MFA_PREVIOUS_ENCRYPTION_KEYS: Joi.string().allow('').default(''),

  AUTH_MAX_FAILED_ATTEMPTS: Joi.number().integer().min(1).max(100).default(5),

  AUTH_LOCK_TIME_MINUTES: Joi.number().integer().min(1).max(10_080).default(15),

  /*
   * ==============================================================
   * ARGON2
   * ==============================================================
   */

  ARGON2_MEMORY_COST: Joi.number()
    .integer()
    .min(19_456)
    .max(1_048_576)
    .default(65_536),

  ARGON2_TIME_COST: Joi.number().integer().min(2).max(20).default(3),

  ARGON2_PARALLELISM: Joi.number().integer().min(1).max(16).default(1),

  ARGON2_HASH_LENGTH: Joi.number().integer().min(32).max(128).default(32),

  ARGON2_MAX_PASSWORD_BYTES: Joi.number()
    .integer()
    .min(64)
    .max(65_536)
    .default(4_096),

  /*
   * ==============================================================
   * DATABASE
   * ==============================================================
   */

  DATABASE_ENABLED: booleanEnv().default(true),

  DATABASE_HOST: Joi.string().trim().min(1).default('localhost'),

  DATABASE_PORT: Joi.number().port().default(5432),

  DATABASE_USERNAME: Joi.string().trim().min(1).default('postgres'),

  DATABASE_PASSWORD: Joi.string().allow('').default('postgres'),

  DATABASE_NAME: Joi.string().trim().min(1).default('centralized_api'),

  DATABASE_SYNCHRONIZE: booleanEnv().default(false),

  DATABASE_MIGRATIONS: booleanEnv().default(false),

  DATABASE_SSL: booleanEnv().default(false),

  DATABASE_SSL_REJECT_UNAUTHORIZED: booleanEnv().default(true),

  DATABASE_SSL_CA: Joi.string().allow('').default(''),

  DATABASE_LOGGING: booleanEnv().default(false),

  DATABASE_MAX_CONNECTIONS: Joi.number()
    .integer()
    .min(1)
    .max(1_000)
    .default(20),

  DATABASE_IDLE_TIMEOUT: Joi.number()
    .integer()
    .min(0)
    .max(3_600_000)
    .default(30_000),

  DATABASE_CONNECTION_TIMEOUT: Joi.number()
    .integer()
    .min(100)
    .max(300_000)
    .default(5_000),

  /*
   * ==============================================================
   * DATABASE REPLICA
   * ==============================================================
   */

  DATABASE_REPLICA_HOST: Joi.string().allow('').default(''),

  DATABASE_REPLICA_PORT: Joi.number().port().default(5432),

  DATABASE_REPLICA_USERNAME: Joi.string().allow('').default(''),

  DATABASE_REPLICA_PASSWORD: Joi.string().allow('').default(''),

  DATABASE_REPLICA_NAME: Joi.string().allow('').default(''),

  /*
   * ==============================================================
   * REDIS
   * ==============================================================
   */

  REDIS_HOST: Joi.string().trim().min(1).default('localhost'),

  REDIS_PORT: Joi.number().port().default(6379),

  REDIS_USERNAME: Joi.string().allow('').default(''),

  REDIS_PASSWORD: Joi.string().allow('').default(''),

  REDIS_TLS: booleanEnv().default(false),

  REDIS_NAMESPACE: namespaceSchema.default('centralized-api'),

  REDIS_CONNECT_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(60_000)
    .default(5_000),

  REDIS_COMMAND_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(60_000)
    .default(2_000),

  /*
   * ==============================================================
   * CACHE
   * ==============================================================
   */

  CACHE_ENABLED: booleanEnv().default(true),

  CACHE_TTL_SECONDS: Joi.number().integer().min(1).max(31_536_000).default(300),

  /*
   * Temporary backward compatibility if your cache config
   * still reads CACHE_TTL.
   */
  CACHE_TTL: Joi.number().integer().min(0).max(31_536_000).default(300),

  CACHE_NAMESPACE: namespaceSchema.default('cache'),

  CACHE_SCAN_COUNT: Joi.number().integer().min(10).max(10_000).default(100),

  /*
   * ==============================================================
   * QUEUE
   * ==============================================================
   */

  QUEUE_ENABLED: booleanEnv().default(true),

  QUEUE_PREFIX: namespaceSchema.default('centralized-api'),

  QUEUE_EVENT_NAME: nonEmptyString.max(255).default('events.v1'),

  QUEUE_DLQ_NAME: nonEmptyString.max(255).default('events.dlq.v1'),

  QUEUE_CONCURRENCY: Joi.number().integer().min(1).max(1_000).default(5),

  QUEUE_ATTEMPTS: Joi.number().integer().min(1).max(100).default(5),

  QUEUE_BACKOFF_DELAY_MS: Joi.number()
    .integer()
    .min(100)
    .max(86_400_000)
    .default(1_000),

  QUEUE_BACKOFF_JITTER: Joi.number().min(0).max(1).default(0.2),

  QUEUE_STACK_TRACE_LIMIT: Joi.number().integer().min(1).max(1_000).default(20),

  QUEUE_MAX_STALLED_COUNT: Joi.number().integer().min(1).max(100).default(1),

  QUEUE_LOCK_DURATION_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(3_600_000)
    .default(30_000),

  QUEUE_FAILURE_RECONCILE_LIMIT: Joi.number()
    .integer()
    .min(1)
    .max(10_000)
    .default(1_000),

  QUEUE_COMPLETED_RETENTION_SECONDS: Joi.number()
    .integer()
    .min(0)
    .default(86_400),

  QUEUE_COMPLETED_RETENTION_COUNT: Joi.number()
    .integer()
    .min(0)
    .default(10_000),

  QUEUE_FAILED_RETENTION_SECONDS: Joi.number()
    .integer()
    .min(0)
    .default(604_800),

  QUEUE_FAILED_RETENTION_COUNT: Joi.number().integer().min(0).default(50_000),

  QUEUE_DLQ_COMPLETED_RETENTION_SECONDS: Joi.number()
    .integer()
    .min(0)
    .default(86_400),

  QUEUE_DLQ_COMPLETED_RETENTION_COUNT: Joi.number()
    .integer()
    .min(0)
    .default(10_000),

  QUEUE_DLQ_FAILED_RETENTION_SECONDS: Joi.number()
    .integer()
    .min(0)
    .default(604_800),

  QUEUE_DLQ_FAILED_RETENTION_COUNT: Joi.number()
    .integer()
    .min(0)
    .default(50_000),

  /*
   * ==============================================================
   * OUTBOX
   * ==============================================================
   */

  OUTBOX_ENABLED: booleanEnv().default(true),

  OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).max(1_000).default(50),

  OUTBOX_POLL_INTERVAL_MS: Joi.number()
    .integer()
    .min(100)
    .max(60_000)
    .default(1_000),

  OUTBOX_LEASE_DURATION_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(300_000)
    .default(30_000),

  OUTBOX_MAX_ATTEMPTS: Joi.number().integer().min(1).max(100).default(10),

  OUTBOX_PUBLISH_CONCURRENCY: Joi.number().integer().min(1).max(100).default(5),

  OUTBOX_RETRY_BASE_DELAY_MS: Joi.number()
    .integer()
    .min(100)
    .max(86_400_000)
    .default(1_000),

  OUTBOX_RETRY_MAX_DELAY_MS: Joi.number()
    .integer()
    .min(100)
    .max(86_400_000)
    .default(60_000),

  OUTBOX_RETENTION_DAYS: Joi.number().integer().min(1).max(3_650).default(30),

  /*
   * ==============================================================
   * OBJECT STORAGE
   * ==============================================================
   */

  STORAGE_ENABLED: booleanEnv().default(false),

  STORAGE_ENDPOINT: Joi.string().uri().allow('').default(''),

  STORAGE_REGION: Joi.string().trim().min(1).default('us-east-1'),

  STORAGE_BUCKET: Joi.string().allow('').default(''),

  STORAGE_ACCESS_KEY_ID: Joi.string().allow('').default(''),

  STORAGE_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),

  STORAGE_SESSION_TOKEN: Joi.string().allow('').default(''),

  STORAGE_FORCE_PATH_STYLE: booleanEnv().default(false),

  STORAGE_TLS: booleanEnv().default(true),

  STORAGE_MAX_ATTEMPTS: Joi.number().integer().min(1).max(20).default(3),

  STORAGE_PRESIGNED_EXPIRY_SECONDS: Joi.number()
    .integer()
    .min(1)
    .max(604_800)
    .default(900),

  /*
   * ==============================================================
   * MAIL
   * ==============================================================
   */

  MAIL_HOST: Joi.string().allow('').default(''),

  MAIL_PORT: Joi.number().port().default(587),

  MAIL_SECURE: booleanEnv().default(false),

  MAIL_TLS_REJECT_UNAUTHORIZED: booleanEnv().default(true),

  MAIL_FROM: Joi.string().allow('').default(''),

  /*
   * ==============================================================
   * CORS
   * ==============================================================
   */

  CORS_ORIGIN: Joi.string().allow('').default('http://localhost:3000'),

  CORS_METHODS: Joi.string().default('GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS'),

  CORS_CREDENTIALS: booleanEnv().default(true),

  CORS_MAX_AGE: Joi.number().integer().min(0).max(604_800).default(86_400),

  CORS_ALLOW_HEADERS: Joi.string().default(
    'Origin,Content-Type,Accept,Authorization,X-API-Key,X-Request-Id,X-Trace-Id,X-XSRF-TOKEN',
  ),

  CORS_EXPOSE_HEADERS: Joi.string().default(
    'Content-Length,X-Request-Id,X-Trace-Id,X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset,Retry-After',
  ),

  /*
   * ==============================================================
   * HTTP SECURITY
   * ==============================================================
   */

  HELMET_ENABLED: booleanEnv().default(true),

  /*
   * New preferred proxy configuration.
   */
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(16).default(0),

  /*
   * Temporary compatibility with your old boolean setting.
   */
  TRUST_PROXY: booleanEnv().default(false),

  SECURE_COOKIES: booleanEnv().default(false),

  COOKIE_HTTP_ONLY: booleanEnv().default(true),

  COOKIE_SAME_SITE: Joi.string().valid('lax', 'strict', 'none').default('lax'),

  SESSION_COOKIE_NAME: Joi.string()
    .trim()
    .min(1)
    .max(128)
    .default('connect.sid'),

  /*
   * ==============================================================
   * DEFAULT GATEWAY JWE TRANSPORT
   * ==============================================================
   */

  CRYPTO_ENABLED: booleanEnv().default(false),

  SERVER_ID: Joi.string()
    .trim()
    .pattern(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/)
    .default('default-server'),

  SERVER_KEY_ID: Joi.string()
    .trim()
    .min(1)
    .max(256)
    .default('client-encryption-v1'),

  SERVER_PRIVATE_KEY_PATH: Joi.string().trim().allow('').max(1024).default(''),

  GATEWAY_ID: Joi.string()
    .trim()
    .pattern(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/)
    .default('default-gateway'),

  GATEWAY_KEY_ID: Joi.string()
    .trim()
    .min(1)
    .max(256)
    .default('gateway-encryption-v1'),

  GATEWAY_PUBLIC_KEY_PATH: Joi.string().trim().allow('').max(1024).default(''),

  CRYPTO_MESSAGE_TTL_SECONDS: Joi.number()
    .integer()
    .min(1)
    .max(120)
    .default(120),

  /*
   * ==============================================================
   * GATEWAY
   * ==============================================================
   */

  GATEWAY_ENABLED: booleanEnv().default(true),

  GATEWAY_BASE_URL: Joi.string().uri().allow('').default(''),

  GATEWAY_API_KEY: Joi.string().allow('').max(512).default(''),

  GATEWAY_TIMEOUT: Joi.number().integer().min(1).max(120_000).default(10_000),
})
  .custom((value, helpers) => {
    if (
      value.CRYPTO_ENABLED &&
      (!value.SERVER_PRIVATE_KEY_PATH ||
        !value.GATEWAY_PUBLIC_KEY_PATH ||
        !value.GATEWAY_ENABLED ||
        !value.GATEWAY_BASE_URL ||
        !/^[^\s]{32,512}$/u.test(value.GATEWAY_API_KEY) ||
        value.SERVER_ID === value.GATEWAY_ID)
    ) {
      return helpers.error('any.invalid');
    }

    /*
     * ----------------------------------------------------------
     * Production security
     * ----------------------------------------------------------
     */

    if (value.NODE_ENV === 'production') {
      const secrets = [
        value.JWT_SECRET,
        value.SESSION_SECRET,
        value.CSRF_SECRET,
      ];

      if (secrets.some((secret) => isUnsafeProductionSecret(secret))) {
        return helpers.error('any.invalid');
      }

      if (!value.MFA_ENCRYPTION_KEY) {
        return helpers.error('any.invalid');
      }

      if (!value.SECURE_COOKIES) {
        return helpers.error('any.invalid');
      }

      if (!value.HELMET_ENABLED) {
        return helpers.error('any.invalid');
      }

      if (value.DISABLE_POST_CSRF) {
        return helpers.error('any.invalid');
      }

      if (value.DATABASE_SYNCHRONIZE) {
        return helpers.error('any.invalid');
      }

      if (value.DATABASE_SSL && !value.DATABASE_SSL_REJECT_UNAUTHORIZED) {
        return helpers.error('any.invalid');
      }

      if (!value.MAIL_TLS_REJECT_UNAUTHORIZED) {
        return helpers.error('any.invalid');
      }

      const productionOrigins = splitCsv(value.CORS_ORIGIN);

      if (
        productionOrigins.some(
          (origin) => !origin.startsWith('https://') || origin.includes('*'),
        )
      ) {
        return helpers.error('any.invalid');
      }

      if (
        value.SWAGGER_ENABLED &&
        (!value.SWAGGER_AUTH_ENABLED ||
          !value.SWAGGER_USERNAME ||
          !value.SWAGGER_PASSWORD ||
          value.SWAGGER_PASSWORD.length < 16)
      ) {
        return helpers.error('any.invalid');
      }
    }

    /*
     * ----------------------------------------------------------
     * Swagger
     * ----------------------------------------------------------
     */

    if (
      value.SWAGGER_ENABLED &&
      value.SWAGGER_AUTH_ENABLED &&
      (!value.SWAGGER_USERNAME ||
        !value.SWAGGER_PASSWORD ||
        value.SWAGGER_PASSWORD.length < 16)
    ) {
      return helpers.error('any.invalid');
    }

    /*
     * ----------------------------------------------------------
     * Cookies
     * ----------------------------------------------------------
     */

    if (value.COOKIE_SAME_SITE === 'none' && !value.SECURE_COOKIES) {
      return helpers.error('any.invalid');
    }

    /*
     * ----------------------------------------------------------
     * CSRF/CORS
     * ----------------------------------------------------------
     */

    const allowedHeaders = splitCsv(value.CORS_ALLOW_HEADERS).map((header) =>
      header.toLowerCase(),
    );

    if (!allowedHeaders.includes('x-xsrf-token')) {
      return helpers.error('any.invalid');
    }

    if (value.CORS_CREDENTIALS && splitCsv(value.CORS_ORIGIN).includes('*')) {
      return helpers.error('any.invalid');
    }

    /*
     * ----------------------------------------------------------
     * Worker / Queue / Outbox
     * ----------------------------------------------------------
     */

    if (value.APP_ROLE === 'worker' && !value.QUEUE_ENABLED) {
      return helpers.error('any.invalid');
    }

    if (value.OUTBOX_ENABLED && !value.QUEUE_ENABLED) {
      return helpers.error('any.invalid');
    }

    if (value.OUTBOX_RETRY_MAX_DELAY_MS < value.OUTBOX_RETRY_BASE_DELAY_MS) {
      return helpers.error('any.invalid');
    }

    /*
     * ----------------------------------------------------------
     * Object storage
     * ----------------------------------------------------------
     *
     * Endpoint and explicit access keys are deliberately NOT
     * required.
     *
     * AWS S3 can use:
     * - IAM instance/task roles
     * - environment credentials
     * - credential files
     * - other AWS SDK credential providers
     */

    if (value.STORAGE_ENABLED && !value.STORAGE_BUCKET) {
      return helpers.error('any.invalid');
    }

    const hasAccessKey = Boolean(value.STORAGE_ACCESS_KEY_ID);

    const hasSecretKey = Boolean(value.STORAGE_SECRET_ACCESS_KEY);

    if (hasAccessKey !== hasSecretKey) {
      return helpers.error('any.invalid');
    }

    if (value.STORAGE_SESSION_TOKEN && !hasAccessKey) {
      return helpers.error('any.invalid');
    }

    /*
     * ----------------------------------------------------------
     * Database replica
     * ----------------------------------------------------------
     */

    const replicaHost = Boolean(value.DATABASE_REPLICA_HOST);

    const replicaUsername = Boolean(value.DATABASE_REPLICA_USERNAME);

    const replicaName = Boolean(value.DATABASE_REPLICA_NAME);

    const replicaConfigured =
      replicaHost ||
      replicaUsername ||
      replicaName ||
      Boolean(value.DATABASE_REPLICA_PASSWORD);

    if (
      replicaConfigured &&
      (!replicaHost || !replicaUsername || !replicaName)
    ) {
      return helpers.error('any.invalid');
    }

    return value;
  }, 'cross-feature validation')
  /*
   * process.env contains many variables unrelated to this
   * application (PATH, HOME, SHELL, etc.), so they must remain
   * allowed.
   */
  .unknown(true);

function splitCsv(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isUnsafeProductionSecret(value: unknown): boolean {
  if (typeof value !== 'string') {
    return true;
  }

  const secret = value.trim();

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    return true;
  }

  return /change.?me|password|development|example|replace|default|secret123/i.test(
    secret,
  );
}
