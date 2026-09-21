import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import {
  appConfig,
  authConfig,
  corsConfig,
  gatewayConfig,
  cryptoConfig,
  securityConfig,
  databaseConfig,
  redisConfig,
  cacheConfig,
  queueConfig,
  outboxConfig,
  storageConfig,
  validationSchema,
} from './config';
import { CommonModule } from './common/common.module';
import { ModulesModule } from './modules/modules.module';
import { FeaturesModule } from './features/features.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      load: [
        appConfig,
        authConfig,
        corsConfig,
        gatewayConfig,
        cryptoConfig,
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
    DatabaseModule,
    CommonModule,
    ModulesModule,
    FeaturesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
