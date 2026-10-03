import { BadRequestException, Injectable } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { createHash, randomBytes } from 'node:crypto';

import { EntityManager, IsNull } from 'typeorm';

import { PasswordService } from '../../common/services/password.service';

import { TransactionService } from '../../common/services/transaction.service';

import { MailsService } from '../mails/mails.service';

import { UsersEntity } from '../users/entity/users.entity';

import { AuthSessionService } from './auth-session.service';

import {
  AuthTokenEntity,
  type AuthTokenPurpose,
} from './entity/auth-token.entity';

type SecurityLifecyclePurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

const SECURITY_TOKEN_BYTES = 32;

const SECURITY_TOKEN_MAX_LENGTH = 4_096;

@Injectable()
export class SecurityLifecycleService {
  constructor(
    private readonly config: ConfigService,

    private readonly transactionService: TransactionService,

    private readonly mailsService: MailsService,

    private readonly authSessionService: AuthSessionService,

    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Requests an email-verification token.
   *
   * This deliberately does not reveal whether the supplied
   * email belongs to an account.
   */
  async requestEmailVerification(email: string): Promise<void> {
    await this.issueSecurityToken(email, 'EMAIL_VERIFICATION');
  }

  /**
   * Requests a password-reset token.
   *
   * This deliberately does not reveal whether the supplied
   * email belongs to an account.
   */
  async requestPasswordReset(email: string): Promise<void> {
    await this.issueSecurityToken(email, 'PASSWORD_RESET');
  }

  /**
   * Confirms an email-verification token.
   */
  async verifyEmail(rawToken: string): Promise<void> {
    this.assertSecurityToken(rawToken);

    await this.transactionService.run(async (manager) => {
      const user = await this.consumeSecurityToken(
        manager,
        rawToken,
        'EMAIL_VERIFICATION',
      );

      const now = new Date();

      user.emailVerifiedAt = now;

      await manager.getRepository(UsersEntity).save(user);

      /*
       * Once verification succeeds, invalidate any other
       * outstanding verification tokens for this account.
       */
      await manager.getRepository(AuthTokenEntity).update(
        {
          userId: user.id,

          purpose: 'EMAIL_VERIFICATION',

          consumedAt: IsNull(),
        },

        {
          consumedAt: now,
        },
      );
    });
  }

  /**
   * Resets an account password using a single-use security token.
   */
  async resetPassword(
    rawToken: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<void> {
    if (newPassword !== confirmPassword) {
      throw new BadRequestException({
        code: 'PASSWORD_CONFIRMATION_MISMATCH',

        message: 'Passwords do not match',
      });
    }

    this.assertSecurityToken(rawToken);

    await this.transactionService.run(async (manager) => {
      const user = await this.consumeSecurityToken(
        manager,
        rawToken,
        'PASSWORD_RESET',
      );

      if (await this.passwordService.verify(user.password, newPassword)) {
        throw new BadRequestException({
          code: 'PASSWORD_REUSE_NOT_ALLOWED',

          message: 'New password must be different from the current password',
        });
      }

      const now = new Date();

      user.password = await this.passwordService.hash(newPassword);

      user.passwordChangedAt = now;

      user.forcePasswordChange = false;

      /*
       * Legacy single refresh-token field.
       *
       * Sessions are now primarily tracked in auth_sessions,
       * but clearing this remains harmless while the field
       * exists.
       */
      user.refreshTokenHash = null;

      user.tokenVersion += 1;

      await manager.getRepository(UsersEntity).save(user);

      /*
       * Password reset invalidates every refresh session.
       */
      await this.authSessionService.revokeAllAuthSessions(
        user.id,
        'PASSWORD_RESET',
        manager,
      );

      /*
       * Invalidate every outstanding security token.
       *
       * An attacker possessing an older reset/MFA token should
       * not be able to continue the previous security lifecycle.
       */
      await manager.getRepository(AuthTokenEntity).update(
        {
          userId: user.id,

          consumedAt: IsNull(),
        },

        {
          consumedAt: now,
        },
      );
    });
  }

  /**
   * Issues one account-lifecycle token.
   */
  private async issueSecurityToken(
    email: string,
    purpose: SecurityLifecyclePurpose,
  ): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);

    await this.transactionService.run(async (manager) => {
      const userRepository = manager.getRepository(UsersEntity);

      const user = await userRepository.findOne({
        where: {
          email: normalizedEmail,
        },

        lock: {
          mode: 'pessimistic_write',
        },
      });

      /*
       * Account enumeration protection.
       */
      if (!user) {
        return;
      }

      if (purpose === 'EMAIL_VERIFICATION' && user.emailVerifiedAt) {
        return;
      }

      const tokenRepository = manager.getRepository(AuthTokenEntity);

      const now = new Date();

      /*
       * Only one active token of a given lifecycle purpose
       * should exist for an account.
       */
      await tokenRepository.update(
        {
          userId: user.id,

          purpose,

          consumedAt: IsNull(),
        },

        {
          consumedAt: now,
        },
      );

      const rawToken = randomBytes(SECURITY_TOKEN_BYTES).toString('base64url');

      const token = tokenRepository.create({
        userId: user.id,

        tokenHash: this.hashToken(rawToken),

        purpose,

        expiresAt: new Date(now.getTime() + this.getTokenLifetimeMs(purpose)),

        consumedAt: null,
      });

      await tokenRepository.save(token);

      /*
       * MailsService should stage/enqueue the email through your
       * transactional outbox when an EntityManager is supplied.
       */
      await this.mailsService.sendSecurityToken(
        user.email,
        user.firstname,
        rawToken,
        purpose,
        manager,
      );
    });
  }

  /**
   * Atomically consumes one token and locks its account.
   *
   * Lock order:
   *
   * 1. discover candidate without lock
   * 2. lock user
   * 3. lock token
   *
   * Keeping one lock order throughout the authentication subsystem
   * reduces deadlock risk.
   */
  private async consumeSecurityToken(
    manager: EntityManager,
    rawToken: string,
    purpose: AuthTokenPurpose,
  ): Promise<UsersEntity> {
    const tokenRepository = manager.getRepository(AuthTokenEntity);

    const candidate = await tokenRepository.findOne({
      where: {
        tokenHash: this.hashToken(rawToken),

        purpose,
      },
    });

    if (!candidate) {
      throw this.invalidSecurityToken();
    }

    const user = await manager
      .getRepository(UsersEntity)
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', {
        id: candidate.userId,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (!user) {
      /*
       * Do not disclose whether the account was deleted.
       */
      throw this.invalidSecurityToken();
    }

    const token = await tokenRepository.findOne({
      where: {
        id: candidate.id,
      },

      lock: {
        mode: 'pessimistic_write',
      },
    });

    const now = new Date();

    if (!token || token.consumedAt || token.expiresAt <= now) {
      throw this.invalidSecurityToken();
    }

    /*
     * Consume before continuing.
     *
     * If the surrounding transaction fails, consumption rolls
     * back together with the operation.
     */
    token.consumedAt = now;

    await tokenRepository.save(token);

    return user;
  }

  private getTokenLifetimeMs(purpose: SecurityLifecyclePurpose): number {
    switch (purpose) {
      case 'PASSWORD_RESET':
        return this.getConfiguredMinutes(
          'auth.passwordResetTokenTtlMinutes',
          30,
          5,
          24 * 60,
        );

      case 'EMAIL_VERIFICATION':
        return this.getConfiguredMinutes(
          'auth.emailVerificationTokenTtlMinutes',
          24 * 60,
          5,
          7 * 24 * 60,
        );
    }
  }

  private getConfiguredMinutes(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = this.config.get<number>(key, fallback);

    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new Error(
        `${key} must be an integer between ${minimum} and ${maximum}`,
      );
    }

    return value * 60_000;
  }

  private normalizeEmail(value: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException({
        code: 'INVALID_EMAIL',

        message: 'Email address is invalid',
      });
    }

    const normalized = value.trim().toLowerCase();

    if (!normalized || normalized.length > 254) {
      throw new BadRequestException({
        code: 'INVALID_EMAIL',

        message: 'Email address is invalid',
      });
    }

    return normalized;
  }

  private assertSecurityToken(value: string): void {
    if (
      typeof value !== 'string' ||
      !value ||
      value.length > SECURITY_TOKEN_MAX_LENGTH ||
      value.trim() !== value
    ) {
      throw this.invalidSecurityToken();
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private invalidSecurityToken(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_SECURITY_TOKEN',

      message: 'Token is invalid or expired',
    });
  }
}
