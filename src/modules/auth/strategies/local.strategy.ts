import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import type { UsersEntity } from '../../users/entity/users.entity';

const MAX_LOGIN_IDENTIFIER_LENGTH = 254;
const MAX_PASSWORD_BYTES = 4_096;
const MAX_USER_AGENT_LENGTH = 1_024;

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private readonly authService: AuthService) {
    super({
      usernameField: 'usernameOrEmail',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(
    request: Request,
    usernameOrEmail: unknown,
    password: unknown,
  ): Promise<UsersEntity> {
    if (typeof usernameOrEmail !== 'string' || typeof password !== 'string') {
      throw this.invalidCredentials();
    }

    const identifier = usernameOrEmail.trim().toLowerCase();

    /*
     * Do not trim or otherwise modify the password itself.
     * Spaces can legitimately be part of a password.
     */
    if (
      !identifier ||
      identifier.length > MAX_LOGIN_IDENTIFIER_LENGTH ||
      !password ||
      Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES
    ) {
      throw this.invalidCredentials();
    }
    const ip = this.normalizeIp(request.ip);
    const userAgent = this.normalizeUserAgent(request.get('user-agent'));
    /*
     * Do not catch infrastructure errors here.
     *
     * A database/Redis failure should remain an infrastructure
     * failure rather than being incorrectly converted into 401.
     */
    const user = await this.authService.validateUser(
      identifier,
      password,
      ip,
      userAgent,
    );
    if (!user) {
      throw this.invalidCredentials();
    }
    return user;
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid username/email or password',
    });
  }

  private normalizeIp(value: unknown): string {
    if (typeof value !== 'string' || !value) {
      return 'unknown';
    }

    /*
     * IPv6 textual representation fits well below this,
     * but the bound protects persistence/logging.
     */
    return value.slice(0, 64);
  }

  private normalizeUserAgent(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const normalized = value
      // oxlint-disable-next-line no-control-regex -- strip control characters from untrusted user-agent input.
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .trim()
      .slice(0, MAX_USER_AGENT_LENGTH);
    return normalized || undefined;
  }
}
