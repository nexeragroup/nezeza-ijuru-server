import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

import { UsersModule } from '../users/users.module';

import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthTokenEntity } from './entity/auth-token.entity';
import { AuthSessionEntity } from './entity/auth-session.entity';
import { LoginAttemptEntity } from './entity/login-attempt.entity';
import { UsersEntity } from '../users/entity/users.entity';
import { SecurityLifecycleService } from './security-lifecycle.service';
import { AuthSessionService } from './auth-session.service';
import { MailsModule } from '../mails/mails.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    UsersModule,
    MailsModule,
    CommonModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    TypeOrmModule.forFeature([
      AuthTokenEntity,
      AuthSessionEntity,
      LoginAttemptEntity,
      UsersEntity,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('auth.jwtSecret'),
        signOptions: {
          expiresIn: config.getOrThrow<string>(
            'auth.accessTokenExpiresIn',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],

  controllers: [AuthController],
  providers: [
    AuthService,
    SecurityLifecycleService,
    AuthSessionService,
    JwtStrategy,
    LocalStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
