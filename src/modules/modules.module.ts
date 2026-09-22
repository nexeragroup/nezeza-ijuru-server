import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { CryptoModule } from './crypto/crypto.module';
import { BackupsModule } from './backups/backups.module';
import { MailsModule } from './mails/mails.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    HealthModule,
    AuditLogsModule,
    CryptoModule,
    BackupsModule,
    MailsModule,
    StorageModule,
  ],
  controllers: [],
  providers: [],
})
export class ModulesModule {}
