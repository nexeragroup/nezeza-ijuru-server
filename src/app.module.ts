import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import corsConfig from './config/cors.config';
import securityConfig from './config/security.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import cacheConfig from './config/cache.config';
import queueConfig from './config/queue.config';
import outboxConfig from './config/outbox.config';
import storageConfig from './config/storage.config';
import { validationSchema } from './config/validation';
import { DatabaseModule } from './database/database.module';
import { ModulesModule } from './modules/modules.module';
import { FeaturesModule } from './features/features.module';

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
      load: [
        appConfig,
        authConfig,
        corsConfig,
        securityConfig,
        databaseConfig,
        redisConfig,
        cacheConfig,
        queueConfig,
        outboxConfig,
        storageConfig,
      ],
      validationSchema,
    }),
    CommonModule,
    DatabaseModule,
    ModulesModule,
    FeaturesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
