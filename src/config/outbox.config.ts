export default () => ({
  outbox: {
    enabled: process.env.OUTBOX_ENABLED !== 'false',
    batchSize: Number(process.env.OUTBOX_BATCH_SIZE ?? 50),
    pollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1_000),
    leaseDurationMs: Number(process.env.OUTBOX_LEASE_DURATION_MS ?? 30_000),
    maxAttempts: Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 10),
    retentionDays: Number(process.env.OUTBOX_RETENTION_DAYS ?? 30),
  },
});
