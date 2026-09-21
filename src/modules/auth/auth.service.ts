import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as speakeasy from 'speakeasy';
import { createHash, randomBytes } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { UsersEntity } from '../users/entity/users.entity';
import { TransactionService } from '../../common/services/transaction.service';
import { AppLogger } from '../../common/services/app-logger.service';
import { SecretProtectionService } from '../../common/services/secret-protection.service';
import { PasswordService } from '../../common/services/password.service';
import { Status } from '../../common/enums/status.enum';
import { AuthSessionService } from './auth-session.service';
import { LoginAttemptEntity } from './entity/login-attempt.entity';
import { AuthTokenEntity } from './entity/auth-token.entity';
import { MailsService } from '../mails/mails.service';
import { ChangePassword } from './dto/change-password.dto';
import { EnableTwoFactor } from './dto/enable-2fa.dto';
import { VerifyTwoFactor } from './dto/verify-2fa.dto';
import { normalizeRoles } from '../../common/utils/role.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly transactionService: TransactionService,
    private readonly logger: AppLogger,
    private readonly sessions: AuthSessionService,
    @InjectRepository(LoginAttemptEntity)
    private readonly attempts: Repository<LoginAttemptEntity>,
    private readonly mails: MailsService,
    private readonly passwords: PasswordService,
    private readonly secrets: SecretProtectionService,
  ) {}

  private async lockUser(manager: EntityManager, id: string) {
    const user = await manager
      .getRepository(UsersEntity)
      .createQueryBuilder('user')
      .addSelect(['user.password', 'user.twoFactorSecret'])
      .where('user.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
    if (!user) throw new UnauthorizedException();
    // Upgrade existing development TOTP values while the account row is locked.
    if (
      user.twoFactorSecret &&
      /^[A-Z2-7]{16,128}$/i.test(user.twoFactorSecret)
    ) {
      user.twoFactorSecret = this.secrets.encrypt(user.twoFactorSecret);
      await manager.save(user);
    }
    return user;
  }
  private authorize(user: UsersEntity) {
    if (
      user.status !== Status.ACTIVE ||
      !user.emailVerifiedAt ||
      user.forcePasswordChange ||
      (user.isLocked &&
        (!user.lockExpiresAt || user.lockExpiresAt > new Date()))
    )
      throw new UnauthorizedException('Account is not authorized');
  }
  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  private verifyCode(user: UsersEntity, code: string) {
    try {
      return (
        !!user.twoFactorSecret &&
        speakeasy.totp.verify({
          secret: this.secrets.decrypt(user.twoFactorSecret),
          encoding: 'base32',
          token: code,
          window: 1,
        })
      );
    } catch {
      return false;
    }
  }
  async validateUser(
    identifier: string,
    password: string,
    ip?: string,
    userAgent?: string,
  ) {
    const user = await this.usersService.findUserByLoginIdentifier(identifier);
    if (!user) {
      await this.recordAttempt(
        null,
        identifier,
        ip,
        userAgent,
        'FAILURE',
        'INVALID_CREDENTIALS',
      );
      throw new UnauthorizedException('Wrong username or password');
    }
    this.authorize(user);
    if (!(await this.passwords.verify(user.password, password))) {
      const updated = await this.usersService.recordFailedLogin(
        user.id,
        this.config.get<number>('auth.maxFailedAttempts', 5),
        this.config.get<number>('auth.lockTimeMinutes', 15),
      );
      await this.recordAttempt(
        user,
        identifier,
        ip,
        userAgent,
        'FAILURE',
        'INVALID_CREDENTIALS',
      );
      if (updated.isLocked)
        await this.mails.sendAccountLocked(user.email, user.firstname);
      throw new UnauthorizedException('Wrong username or password');
    }
    return user;
  }
  async login(validated: UsersEntity, ip?: string, userAgent?: string) {
    return this.transactionService.run(async (manager) => {
      const user = await this.lockUser(manager, validated.id);
      this.authorize(user);
      if (
        user.tokenVersion !== validated.tokenVersion ||
        user.password !== validated.password
      )
        throw new UnauthorizedException('Credentials changed; log in again');
      if (user.isTwoFactorEnabled) {
        const challengeToken = randomBytes(48).toString('base64url');
        await manager.getRepository(AuthTokenEntity).save({
          userId: user.id,
          tokenHash: this.hash(challengeToken),
          purpose: 'MFA_LOGIN',
          expiresAt: new Date(Date.now() + 5 * 60000),
          consumedAt: null,
        });
        return { mfaRequired: true as const, challengeToken };
      }
      return this.finishLogin(manager, user, ip, userAgent);
    });
  }
  private async finishLogin(
    manager: EntityManager,
    user: UsersEntity,
    ip?: string,
    userAgent?: string,
  ) {
    user.isLocked = false;
    user.lockedAt = null;
    user.lockExpiresAt = null;
    user.failedLoginAttempts = 0;
    user.lastFailedLoginAt = null;
    user.lastLoginAt = new Date();
    user.lastLoginIp = ip ?? null;
    await manager.save(user);
    user.roles = (
      await manager
        .getRepository(UsersEntity)
        .findOneOrFail({
          where: { id: user.id },
          relations: { roles: { permissions: true } },
        })
    ).roles;
    const tokens = await this.generateTokens(user);
    const refreshToken = await this.sessions.createAuthSession(
      user.id,
      ip,
      userAgent,
      manager,
    );
    await manager.getRepository(LoginAttemptEntity).save({
      userId: user.id,
      identifierHash: this.hash(user.username),
      ip: ip ?? 'unknown',
      userAgent: userAgent ?? null,
      result: 'SUCCESS',
      reason: null,
    });
    return { ...tokens, refreshToken };
  }
  async completeMfa(
    raw: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ) {
    const result = await this.transactionService.run(async (manager) => {
      const repo = manager.getRepository(AuthTokenEntity);
      const candidate = await repo.findOneBy({
        tokenHash: this.hash(raw),
        purpose: 'MFA_LOGIN',
      });
      if (!candidate) return null;
      const user = await this.lockUser(manager, candidate.userId);
      const token = await repo.findOne({
        where: { id: candidate.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!token || token.consumedAt || token.expiresAt <= new Date())
        return null;
      this.authorize(user);
      // A challenge is single-use even on an incorrect code; a fresh password login is required.
      await repo.update(token.id, { consumedAt: new Date() });
      if (!user.isTwoFactorEnabled || !this.verifyCode(user, code)) return null;
      return this.finishLogin(manager, user, ip, userAgent);
    });
    if (!result)
      throw new UnauthorizedException('Invalid or expired MFA challenge/code');
    return result;
  }
  private async invalidate(
    manager: EntityManager,
    user: UsersEntity,
    reason: string,
  ) {
    user.tokenVersion += 1;
    user.refreshTokenHash = null;
    await manager.save(user);
    await this.sessions.revokeAllAuthSessions(user.id, reason, manager);
    await manager
      .getRepository(AuthTokenEntity)
      .update(
        { userId: user.id, purpose: 'MFA_LOGIN' },
        { consumedAt: new Date() },
      );
  }
  async logout(userId: string) {
    await this.transactionService.run(async (manager) =>
      this.invalidate(manager, await this.lockUser(manager, userId), 'LOGOUT'),
    );
  }
  async logoutAllDevices(userId: string) {
    await this.logout(userId);
  }
  async changePassword(username: string, dto: ChangePassword) {
    if (dto.newPassword !== dto.confirmPassword)
      throw new BadRequestException('Passwords do not match');
    const candidate =
      await this.usersService.findUserByLoginIdentifier(username);
    if (!candidate) throw new UnauthorizedException();
    await this.transactionService.run(async (manager) => {
      const user = await this.lockUser(manager, candidate.id);
      if (!(await this.passwords.verify(user.password, dto.currentPassword)))
        throw new BadRequestException('Current password is incorrect');
      if (await this.passwords.verify(user.password, dto.newPassword))
        throw new BadRequestException(
          'New password must be different from current password',
        );
      user.password = await this.passwords.hash(dto.newPassword);
      user.passwordChangedAt = new Date();
      user.forcePasswordChange = false;
      await this.invalidate(manager, user, 'PASSWORD_CHANGE');
    });
  }
  async enableTwoFactor(userId: string, dto: EnableTwoFactor) {
    return this.transactionService.run(async (manager) => {
      const user = await this.lockUser(manager, userId);
      if (!(await this.passwords.verify(user.password, dto.password)))
        throw new UnauthorizedException();
      if (user.isTwoFactorEnabled)
        throw new ConflictException(
          'Disable the existing factor before replacing it',
        );
      const secret = speakeasy.generateSecret({
        name: `${this.config.get<string>('app.name', 'API')} (${user.email})`,
      });
      user.twoFactorSecret = this.secrets.encrypt(secret.base32);
      await manager.save(user);
      return { qrCode: secret.otpauth_url, manualKey: secret.base32 };
    });
  }
  async verifyTwoFactor(userId: string, dto: VerifyTwoFactor) {
    await this.transactionService.run(async (manager) => {
      const user = await this.lockUser(manager, userId);
      if (user.isTwoFactorEnabled)
        throw new ConflictException('MFA is already enabled');
      if (!this.verifyCode(user, dto.code))
        throw new BadRequestException('Invalid verification code');
      user.isTwoFactorEnabled = true;
      user.twoFactorVerifiedAt = new Date();
      await this.invalidate(manager, user, 'MFA_ENABLED');
    });
  }
  async disableTwoFactor(
    userId: string,
    dto: { password: string; code: string },
  ) {
    await this.transactionService.run(async (manager) => {
      const user = await this.lockUser(manager, userId);
      if (
        !user.isTwoFactorEnabled ||
        !(await this.passwords.verify(user.password, dto.password)) ||
        !this.verifyCode(user, dto.code)
      )
        throw new UnauthorizedException('Invalid credentials');
      user.isTwoFactorEnabled = false;
      user.twoFactorSecret = null;
      user.twoFactorVerifiedAt = null;
      await this.invalidate(manager, user, 'MFA_DISABLED');
    });
  }
  async refreshToken(raw: string, ip?: string, userAgent?: string) {
    const rotated = await this.sessions.rotateAuthSession(raw, ip, userAgent);
    const user = await this.usersService.findUserForAuthorization(rotated.userId);
    if (!user) throw new UnauthorizedException();
    this.authorize(user);
    if (user.tokenVersion !== rotated.tokenVersion)
      throw new UnauthorizedException();
    return {
      ...(await this.generateTokens(user)),
      refreshToken: rotated.refreshToken,
    };
  }
  private async generateTokens(user: UsersEntity) {
    const permissions = [
      ...new Set(
        (user.roles ?? []).flatMap((role) =>
          (role.permissions ?? [])
            .map((permission) => permission.name)
            .filter((permission): permission is string => Boolean(permission)),
        ),
      ),
    ].sort();
    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      roles: normalizeRoles(user.roles),
      permissions,
      purpose: 'access',
      tokenVersion: user.tokenVersion,
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      algorithm: 'HS256',
      expiresIn: this.config.getOrThrow<string>(
        'auth.accessTokenExpiresIn',
      ) as JwtSignOptions['expiresIn'],
    });
    return { accessToken, payload };
  }
  private async recordAttempt(
    user: UsersEntity | null,
    identifier: string,
    ip: string | undefined,
    userAgent: string | undefined,
    result: 'SUCCESS' | 'FAILURE',
    reason: string | null,
  ) {
    await this.attempts.save(
      this.attempts.create({
        userId: user?.id ?? null,
        identifierHash: this.hash(identifier.trim().toLowerCase()),
        ip: ip ?? 'unknown',
        userAgent: userAgent ?? null,
        result,
        reason,
      }),
    );
  }
}
