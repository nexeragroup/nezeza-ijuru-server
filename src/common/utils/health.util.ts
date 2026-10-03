export const HEALTHY_STATUS = 'ok' as const;

export type HealthyStatus = typeof HEALTHY_STATUS;

export const isHealthy = (status: unknown): status is HealthyStatus =>
  status === HEALTHY_STATUS;
