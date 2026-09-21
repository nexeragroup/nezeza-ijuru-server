import { Injectable, UnauthorizedException } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../../../common/types/auth-request.interface';
import { Status } from '../../../common/enums/status.enum';
import { UsersService } from '../../users/users.service';
import { normalizeRoles } from '../../../common/utils/role.util';

interface TokenPayload {
  readonly sub?: unknown;
  readonly purpose?: unknown;
  readonly tokenVersion?: unknown;
  readonly iat?: unknown;
  readonly exp?: unknown;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const issuer = config.get<string>('auth.jwtIssuer')?.trim();
    const audience = config.get<string>('auth.jwtAudience')?.trim();

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('auth.jwtSecret'),
      algorithms: ['HS256'],
      ignoreExpiration: false,
      /*
       * These remain optional for backward compatibility.
       *
       * Once configured, tokens must contain matching iss/aud.
       */
      issuer: issuer || undefined,
      audience: audience || undefined,
    });
  }

  async validate(payload: TokenPayload): Promise<AuthenticatedUser> {
    this.validatePayload(payload);

    /*
     * Dedicated authorization lookup:
     *
     * - roles loaded
     * - permissions loaded
     * - passwords/secrets NOT loaded
     */
    const user = await this.usersService.findUserForAuthorization(payload.sub);

    if (!user) {
      throw this.unauthorized();
    }

    if (
      user.tokenVersion !== payload.tokenVersion ||
      user.status !== Status.ACTIVE ||
      user.isLocked ||
      !user.emailVerifiedAt ||
      user.forcePasswordChange
    ) {
      throw this.unauthorized();
    }

    const roles = normalizeRoles(user.roles);

    const permissions = [
      ...new Set(
        user.roles.flatMap((role) =>
          (role.permissions ?? [])
            .map((permission) => permission.name)
            .filter(
              (permission): permission is string =>
                typeof permission === 'string' && permission.length > 0,
            ),
        ),
      ),
    ].sort();

    return {
      sub: user.id,
      username: user.username,
      email: user.email,
      roles,
      permissions,
    };
  }

  private validatePayload(payload: TokenPayload): asserts payload is {
    readonly sub: string;
    readonly purpose: 'access';
    readonly tokenVersion: number;
    readonly iat?: unknown;
    readonly exp?: unknown;
  } {
    if (
      typeof payload.sub !== 'string' ||
      !UUID_V4_PATTERN.test(payload.sub) ||
      payload.purpose !== 'access' ||
      typeof payload.tokenVersion !== 'number' ||
      !Number.isSafeInteger(payload.tokenVersion) ||
      payload.tokenVersion < 0
    ) {
      throw this.unauthorized();
    }
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_ACCESS_TOKEN',
      message: 'Authentication is required',
    });
  }
}
