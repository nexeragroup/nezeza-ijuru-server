import { RateLimitGuard } from './guards/rate-limit.guard';
import { CsrfMiddleware } from './middleware/csrf.middleware';
import { SecretProtectionService } from './services/secret-protection.service';
import { MailTransportService } from './services/mail-transport.service';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesGuard } from './guards/roles.guard';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { RequestContextInterceptor } from './interceptors/request-context.interceptor';
import { AppLogger } from './services/app-logger.service';
import { PasswordService } from './services/password.service';
import { RedisService } from './services/redis.service';
import { CacheService } from './services/cache.service';
import { SessionMiddleware } from './middleware/session.middleware';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeadLetterEvent } from '../database/events/dead-letter-event.entity';
import { OutboxEvent } from '../database/events/outbox-event.entity';
import { ProcessedEvent } from '../database/events/processed-event.entity';
import { RetryPolicyService } from './services/retry-policy.service';
import { QueueService } from './services/queue.service';
import { DeadLetterService } from './services/dead-letter.service';
import { WorkerService } from './services/worker.service';
import { OutboxService } from './services/outbox.service';
import { OutboxDispatcherService } from './services/outbox-dispatcher.service';
import { IdempotencyService } from './services/idempotency.service';
import { ObjectStorageService } from './services/object-storage.service';
import { RedisThrottlerStorage } from './services/redis-throttler-storage.service';
import { TransactionService } from './services/transaction.service';
import { AuditLogsModule } from '../modules/audit-logs/audit-logs.module';
import { DatabaseErrorService } from './services/database-error.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeadLetterEvent, OutboxEvent, ProcessedEvent]),
    AuditLogsModule,
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('auth.jwtSecret'),
        signOptions: { expiresIn: 900 },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    TransactionService,
    AppLogger,
    PasswordService,
    SecretProtectionService,
    RedisService,
    CacheService,
    SessionMiddleware,
    CsrfMiddleware,
    ObjectStorageService,
    RetryPolicyService,
    QueueService,
    DeadLetterService,
    WorkerService,
    MailTransportService,
    OutboxService,
    DatabaseErrorService,
    OutboxDispatcherService,
    IdempotencyService,
    RedisThrottlerStorage,
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
  ],
  controllers: [],
  exports: [
    TransactionService,
    AppLogger,
    PasswordService,
    SecretProtectionService,
    RedisService,
    CacheService,
    DatabaseErrorService,
    SessionMiddleware,
    CsrfMiddleware,
    QueueService,
    OutboxService,
    IdempotencyService,
    ObjectStorageService,
    RedisThrottlerStorage,
    JwtModule,
  ],
})
export class CommonModule {}
