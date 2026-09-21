export default () => ({
  queue: {
    enabled: process.env.QUEUE_ENABLED !== 'false',
    prefix: process.env.QUEUE_PREFIX ?? 'centralized-api',
    eventQueueName: process.env.QUEUE_EVENT_NAME ?? 'events.v1',
    deadLetterQueueName: process.env.QUEUE_DLQ_NAME ?? 'events.dlq.v1',
    concurrency: Number(process.env.QUEUE_CONCURRENCY ?? 5),
    attempts: Number(process.env.QUEUE_ATTEMPTS ?? 5),
    backoffDelayMs: Number(process.env.QUEUE_BACKOFF_DELAY_MS ?? 1_000),
    completedRetentionSeconds: Number(
      process.env.QUEUE_COMPLETED_RETENTION_SECONDS ?? 86_400,
    ),
    failedRetentionSeconds: Number(
      process.env.QUEUE_FAILED_RETENTION_SECONDS ?? 604_800,
    ),
  },
});
