export default () => ({
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttlSeconds: Number(
      process.env.CACHE_TTL_SECONDS ?? process.env.CACHE_TTL ?? 300,
    ),
    namespace: process.env.CACHE_NAMESPACE ?? 'cache',
    scanCount: Number(process.env.CACHE_SCAN_COUNT ?? 100),
  },
});
