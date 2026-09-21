export type InfrastructureEvent<T = unknown> = {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  correlationId?: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: T;
  headers?: Record<string, string>;
};
