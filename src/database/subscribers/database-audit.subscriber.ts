import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';
import {
  AuditLogEntity,
  AuditLogLevel,
} from '../../modules/audit-logs/entity/audit-log.entity';

type AuditAction = 'insert' | 'update' | 'delete';

type AuditEvent =
  InsertEvent<unknown> | UpdateEvent<unknown> | RemoveEvent<unknown>;

const EXCLUDED_TABLES = new Set([
  'audit_logs',
  'outbox_events',
  'processed_events',
  'dead_letter_events',
  'migrations',
]);

const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordhash',
  'passwordsalt',

  'secret',
  'secretkey',

  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',

  'apikey',

  'credential',
  'credentials',

  'mfasecret',
  'totpsecret',

  'privatekey',
  'encryptionkey',
]);

@EventSubscriber()
export class DatabaseAuditSubscriber implements EntitySubscriberInterface {
  afterInsert(event: InsertEvent<unknown>): Promise<void> {
    return this.record(event, 'insert', event.entity);
  }

  afterUpdate(event: UpdateEvent<unknown>): Promise<void> {
    return this.record(event, 'update', event.entity ?? event.databaseEntity);
  }

  afterRemove(event: RemoveEvent<unknown>): Promise<void> {
    return this.record(event, 'delete', event.entity ?? event.databaseEntity);
  }

  private async record(
    event: AuditEvent,
    action: AuditAction,
    entity: unknown,
  ): Promise<void> {
    const tableName = event.metadata.tableName;

    if (EXCLUDED_TABLES.has(tableName)) {
      return;
    }

    const entityName = event.metadata.name;

    const entityId = this.extractEntityId(event, entity);

    const changedFields = this.extractChangedFields(event, entity);

    const requestContext = this.extractRequestContext(event.queryRunner.data);

    const auditRecord = event.manager.create(AuditLogEntity, {
      level: AuditLogLevel.INFO,

      category: 'database_audit',

      message: `${action.toUpperCase()} ${entityName}`,

      requestId: requestContext.requestId,

      traceId: requestContext.traceId,

      userId: requestContext.userId,

      metadata: {
        action,

        entity: entityName,

        table: tableName,

        entityId,

        changedFields,

        transactionActive: event.queryRunner.isTransactionActive,
      },
    });

    /*
     * Always use the event's manager/query runner.
     *
     * This ensures the audit entry participates in the
     * same transaction when the original operation is
     * transactional.
     */
    await event.manager.save(AuditLogEntity, auditRecord);
  }

  private extractEntityId(
    event: AuditEvent,
    entity: unknown,
  ): Record<string, unknown> {
    const source = this.isRecord(entity) ? entity : undefined;

    const result: Record<string, unknown> = {};

    for (const column of event.metadata.primaryColumns) {
      const value = source ? column.getEntityValue(source) : undefined;

      if (value !== undefined) {
        result[column.propertyName] = this.sanitizeIdentifier(value);
      }
    }

    /*
     * RemoveEvent exposes entityId separately and
     * it can be useful when the entity itself is no
     * longer available.
     */
    if (
      Object.keys(result).length === 0 &&
      'entityId' in event &&
      event.entityId !== undefined
    ) {
      const primaryColumns = event.metadata.primaryColumns;

      if (primaryColumns.length === 1 && !this.isRecord(event.entityId)) {
        result[primaryColumns[0].propertyName] = this.sanitizeIdentifier(
          event.entityId,
        );
      } else if (this.isRecord(event.entityId)) {
        for (const [key, value] of Object.entries(event.entityId)) {
          result[key] = this.sanitizeIdentifier(value);
        }
      }
    }

    return result;
  }

  private extractChangedFields(event: AuditEvent, entity: unknown): string[] {
    let fields: string[];

    if ('updatedColumns' in event && event.updatedColumns.length > 0) {
      fields = event.updatedColumns.map((column) => column.propertyName);
    } else if (this.isRecord(entity)) {
      fields = Object.keys(entity);
    } else {
      fields = [];
    }

    return [...new Set(fields)]
      .filter((field) => !this.isSensitiveField(field))
      .sort();
  }

  private extractRequestContext(data: unknown): {
    requestId: string | null;
    traceId: string | null;
    userId: string | null;
  } {
    if (!this.isRecord(data)) {
      return {
        requestId: null,
        traceId: null,
        userId: null,
      };
    }

    return {
      requestId: this.toNullableString(data.requestId),

      traceId: this.toNullableString(data.traceId),

      userId: this.toNullableString(data.userId),
    };
  }

  private isSensitiveField(field: string): boolean {
    const normalized = field.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    if (SENSITIVE_FIELDS.has(normalized)) {
      return true;
    }

    return (
      normalized.endsWith('password') ||
      normalized.endsWith('secret') ||
      normalized.endsWith('token') ||
      normalized.endsWith('credential') ||
      normalized.endsWith('privatekey')
    );
  }

  private sanitizeIdentifier(value: unknown): unknown {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    return '[complex-identifier]';
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();

    return normalized || null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
