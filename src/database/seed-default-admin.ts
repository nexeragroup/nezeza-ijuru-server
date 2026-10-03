import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import authConfig from '../config/auth.config';
import databaseSettings, { databaseConfig } from '../config/database.config';
import { validationSchema } from '../config/validation';
import { PasswordService } from '../common/services/password.service';
import { PermissionsEntity } from '../modules/permissions/entity/permissions.entity';
import { RolesEntity } from '../modules/roles/entity/roles.entity';
import { UsersEntity } from '../modules/users/entity/users.entity';
import { AuditLogEntity } from '../modules/audit-logs/entity/audit-log.entity';
import {
  DefaultAdminSeedService,
  readDefaultAdminSeedInput,
} from './default-admin.seed.service';

const environmentFileNames: Record<string, string> = {
  development: 'dev',
  staging: 'staging',
  production: 'prod',
};

const environment = process.env.NODE_ENV ?? 'development';
const environmentFile = environmentFileNames[environment] ?? environment;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${environmentFile}`, '.env'],
      load: [authConfig, databaseSettings],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: databaseConfig,
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      AuditLogEntity,
      PermissionsEntity,
      RolesEntity,
      UsersEntity,
    ]),
  ],
  providers: [PasswordService, DefaultAdminSeedService],
})
class DefaultAdminSeedModule {}

async function bootstrap(): Promise<void> {
  const context = await NestFactory.createApplicationContext(
    DefaultAdminSeedModule,
    { logger: false },
  );

  try {
    await context.get(DefaultAdminSeedService).run(readDefaultAdminSeedInput());
  } finally {
    await context.close();
  }
}

void bootstrap().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Default administrator seed failed',
  );
  process.exitCode = 1;
});
