export default () => ({
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true',
    namespace: process.env.REDIS_NAMESPACE ?? 'centralized-api',
    connectTimeoutMs: Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 5_000),
    commandTimeoutMs: Number(process.env.REDIS_COMMAND_TIMEOUT_MS ?? 2_000),
  },
});
