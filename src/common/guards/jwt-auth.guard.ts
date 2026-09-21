import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../types/auth-request.interface';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): ReturnType<CanActivate['canActivate']> {
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  override handleRequest<TUser = AuthenticatedUser>(
    error: unknown,
    user: TUser | false | null | undefined,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    /*
     * Preserve genuine errors raised by the authentication strategy.
     *
     * Example:
     * - database/service failure
     * - explicit UnauthorizedException from validate()
     *
     * Do not silently convert every internal authentication failure
     * into a generic 401.
     */
    if (error) {
      throw error;
    }

    /*
     * Passport returns false/null when authentication simply fails,
     * for example when a JWT is missing, invalid, or expired.
     *
     * Do not expose low-level JWT details such as:
     * "jwt expired"
     * "invalid signature"
     * "jwt malformed"
     */
    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    return user;
  }
}
