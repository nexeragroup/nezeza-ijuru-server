import { Injectable, UnauthorizedException } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { createHash, randomBytes } from 'node:crypto';

import { DataSource, EntityManager, IsNull } from 'typeorm';

import { Status } from '../../common/enums/status.enum';

import { UsersEntity } from '../users/entity/users.entity';

import { AuthSessionEntity } from './entity/auth-session.entity';

export interface RotateAuthSessionResult {
  readonly userId: string;

  readonly refreshToken: string;

  readonly tokenVersion: number;
}

const REFRESH_TOKEN_BYTES = 48;

const SESSION_FAMILY_BYTES = 32;

const MAX_REFRESH_TOKEN_LENGTH = 8_192;

const MAX_USER_AGENT_LENGTH = 1_024;

const MAX_REVOKE_REASON_LENGTH = 100;

const MAX_REFRESH_LIFETIME_MS = 365 * 24 * 60 * 60 * 1_000;

@Injectable()
export class AuthSessionService {
  private readonly refreshLifetimeMs: number;

  constructor(
    private readonly dataSource: DataSource,

    private readonly config: ConfigService,
  ) {
    this.refreshLifetimeMs = this.parseRefreshLifetime(
      this.config.get<string>('auth.refreshTokenExpiresIn', '7d'),
    );
  }

  /**
   * Creates a new refresh-token family/session.
   */
  async createAuthSession(
    userId: string,
    ip?: string,
    userAgent?: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<string> {
    const rawToken = this.generateRefreshToken();

    const familyId = randomBytes(SESSION_FAMILY_BYTES).toString('hex');

    const now = new Date();

    const repository = manager.getRepository(AuthSessionEntity);

    const session = repository.create({
      userId,

      tokenHash: this.hashToken(rawToken),

      familyId,

      expiresAt: new Date(now.getTime() + this.refreshLifetimeMs),

      revokedAt: null,

      revokeReason: null,

      ip: this.normalizeIp(ip),

      userAgent: this.normalizeUserAgent(userAgent),

      lastUsedAt: null,
    });

    await repository.save(session);

    return rawToken;
  }

  /**
   * Atomically rotates a refresh token.
   *
   * The old token becomes unusable immediately while the replacement
   * remains in the same token family.
   */
  async rotateAuthSession(
    rawToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<RotateAuthSessionResult> {
    this.assertRefreshToken(rawToken);

    const result = await this.dataSource.transaction(
      async (manager): Promise<RotateAuthSessionResult | null> => {
        const sessionRepository = manager.getRepository(AuthSessionEntity);

        /*
         * Candidate lookup before locking allows us to determine
         * which user row must be locked first.
         */
        const candidate = await sessionRepository.findOne({
          where: {
            tokenHash: this.hashToken(rawToken),
          },
        });

        if (!candidate) {
          return null;
        }

        /*
         * Always lock the account before the session row.
         *
         * Other security lifecycle operations should use the same
         * order to minimize deadlock risk.
         */
        const userRepository = manager.getRepository(UsersEntity);

        const user = await userRepository.findOne({
          where: {
            id: candidate.userId,
          },

          lock: {
            mode: 'pessimistic_write',
          },
        });

        if (!user) {
          return null;
        }

        const current = await sessionRepository.findOne({
          where: {
            id: candidate.id,
          },

          lock: {
            mode: 'pessimistic_write',
          },
        });

        if (!current) {
          return null;
        }

        const now = new Date();

        /*
         * A revoked token being presented again is refresh-token
         * reuse.
         */
        if (current.revokedAt) {
          await this.handleRefreshTokenReuse(manager, user, current, now);

          /*
           * Returning null allows the revocation transaction to
           * COMMIT before the UnauthorizedException is thrown
           * outside the transaction.
           */
          return null;
        }

        if (current.expiresAt <= now) {
          current.revokedAt = now;

          current.revokeReason = 'EXPIRED';

          current.lastUsedAt = now;

          await sessionRepository.save(current);

          return null;
        }

        /*
         * Expired temporary account lock may be cleared here.
         */
        if (user.isLocked && user.lockExpiresAt && user.lockExpiresAt <= now) {
          user.isLocked = false;

          user.lockedAt = null;

          user.lockExpiresAt = null;

          user.failedLoginAttempts = 0;

          user.lastFailedLoginAt = null;

          await userRepository.save(user);
        }

        if (!this.isAccountAuthorized(user, now)) {
          await this.revokeAllAuthSessions(
            user.id,
            'ACCOUNT_NOT_AUTHORIZED',
            manager,
          );

          return null;
        }

        /*
         * Revoke current generation.
         */
        current.revokedAt = now;

        current.revokeReason = 'ROTATED';

        current.lastUsedAt = now;

        await sessionRepository.save(current);

        /*
         * Issue next generation in the same family.
         *
         * The family keeps its original absolute expiration time,
         * preventing indefinite refresh-token extension.
         */
        const nextRawToken = this.generateRefreshToken();

        const nextSession = sessionRepository.create({
          userId: current.userId,

          tokenHash: this.hashToken(nextRawToken),

          familyId: current.familyId,

          expiresAt: current.expiresAt,

          revokedAt: null,

          revokeReason: null,

          ip: this.normalizeIp(ip),

          userAgent: this.normalizeUserAgent(userAgent),

          lastUsedAt: null,
        });

        await sessionRepository.save(nextSession);

        return {
          userId: current.userId,

          refreshToken: nextRawToken,

          tokenVersion: user.tokenVersion,
        };
      },
    );

    if (!result) {
      throw this.invalidRefreshToken();
    }

    return result;
  }

  /**
   * Revokes every active refresh session belonging to a user.
   */
  async revokeAllAuthSessions(
    userId: string,
    reason: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    const normalizedReason = this.normalizeRevokeReason(reason);

    await manager.getRepository(AuthSessionEntity).update(
      {
        userId,

        revokedAt: IsNull(),
      },

      {
        revokedAt: new Date(),

        revokeReason: normalizedReason,
      },
    );
  }

  /**
   * Revokes one token family.
   *
   * Useful for session/device management interfaces.
   */
  async revokeAuthSessionFamily(
    userId: string,
    familyId: string,
    reason: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    const normalizedFamilyId = familyId.trim();

    if (!/^[0-9a-f]{64}$/i.test(normalizedFamilyId)) {
      throw new Error('Invalid authentication session family ID');
    }

    await manager.getRepository(AuthSessionEntity).update(
      {
        userId,

        familyId: normalizedFamilyId,

        revokedAt: IsNull(),
      },

      {
        revokedAt: new Date(),

        revokeReason: this.normalizeRevokeReason(reason),
      },
    );
  }

  /**
   * Handles reuse of a previously revoked refresh token.
   *
   * The first detected reuse for a family is treated as a security
   * incident and invalidates the user's active authentication state.
   */
  private async handleRefreshTokenReuse(
    manager: EntityManager,
    user: UsersEntity,
    compromisedSession: AuthSessionEntity,
    now: Date,
  ): Promise<void> {
    const sessionRepository = manager.getRepository(AuthSessionEntity);

    /*
     * Avoid repeatedly increasing tokenVersion if an attacker keeps
     * replaying tokens from an already-detected compromised family.
     */
    const familyAlreadyMarked = await sessionRepository.exists({
      where: {
        familyId: compromisedSession.familyId,

        revokeReason: 'TOKEN_REUSE',
      },
    });

    if (familyAlreadyMarked) {
      return;
    }

    /*
     * Mark the actual replayed session as the compromise marker.
     */
    await sessionRepository.update(
      {
        id: compromisedSession.id,
      },

      {
        revokeReason: 'TOKEN_REUSE',

        lastUsedAt: now,
      },
    );

    /*
     * Revoke every remaining active refresh session for the account.
     *
     * This is intentionally stronger than revoking only the affected
     * family because token reuse indicates credential compromise.
     */
    await sessionRepository.update(
      {
        userId: user.id,

        revokedAt: IsNull(),
      },

      {
        revokedAt: now,

        revokeReason: 'TOKEN_REUSE',
      },
    );

    /*
     * Invalidate every outstanding access token.
     */
    user.tokenVersion += 1;

    user.refreshTokenHash = null;

    await manager.getRepository(UsersEntity).save(user);
  }

  private isAccountAuthorized(user: UsersEntity, now: Date): boolean {
    const activelyLocked =
      user.isLocked && (!user.lockExpiresAt || user.lockExpiresAt > now);

    return (
      user.status === Status.ACTIVE &&
      !activelyLocked &&
      Boolean(user.emailVerifiedAt) &&
      !user.forcePasswordChange
    );
  }

  private generateRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private assertRefreshToken(value: string): void {
    if (
      typeof value !== 'string' ||
      !value ||
      value.length > MAX_REFRESH_TOKEN_LENGTH ||
      value.trim() !== value
    ) {
      throw this.invalidRefreshToken();
    }
  }

  private normalizeIp(value: string | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    /*
     * Database column supports canonical IPv4/IPv6 textual values.
     */
    return normalized.slice(0, 45);
  }

  private normalizeUserAgent(value: string | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value
      // oxlint-disable-next-line no-control-regex -- strip control characters from untrusted user-agent input.
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .trim()
      .slice(0, MAX_USER_AGENT_LENGTH);

    return normalized || null;
  }

  private normalizeRevokeReason(value: string): string {
    const normalized = value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_.-]+/g, '_')
      .slice(0, MAX_REVOKE_REASON_LENGTH);

    if (!normalized) {
      throw new Error('Authentication-session revoke reason cannot be empty');
    }

    return normalized;
  }

  private parseRefreshLifetime(value: string): number {
    const match = /^([1-9][0-9]*)(s|m|h|d)$/.exec(value.trim());

    if (!match) {
      throw new Error(
        'auth.refreshTokenExpiresIn must use a duration such as 30m, 12h, or 7d',
      );
    }

    const multiplier: Record<'s' | 'm' | 'h' | 'd', number> = {
      s: 1_000,

      m: 60_000,

      h: 3_600_000,

      d: 86_400_000,
    };

    const amount = Number(match[1]);

    const unit = match[2] as 's' | 'm' | 'h' | 'd';

    const milliseconds = amount * multiplier[unit];

    if (
      !Number.isSafeInteger(milliseconds) ||
      milliseconds <= 0 ||
      milliseconds > MAX_REFRESH_LIFETIME_MS
    ) {
      throw new Error(
        'auth.refreshTokenExpiresIn must resolve to a duration between 1 second and 365 days',
      );
    }

    return milliseconds;
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',

      message: 'Refresh token is invalid or expired',
    });
  }
}
