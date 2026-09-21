import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersEntity } from '../../users/entity/users.entity';

@Injectable()
export class LocalGuard extends AuthGuard('local') {
  /**
   * This application establishes its own authenticated
   * Express session after successful login.
   *
   * Passport must therefore not create/manage a login session.
   */
  override getAuthenticateOptions(_context: ExecutionContext): {
    session: false;
  } {
    return {
      session: false,
    };
  }

  /**
   * Normalizes failed local authentication.
   *
   * Important:
   * - Infrastructure/application errors are preserved.
   * - Invalid credentials receive one generic response.
   * - Passport `info` is deliberately not exposed because
   *   strategy/provider messages may reveal unnecessary details.
   */
  override handleRequest<TUser = UsersEntity>(
    error: unknown,
    user: TUser | false | null | undefined,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    /*
     * Preserve exceptions raised intentionally by the strategy.
     *
     * For example:
     * - database failure
     * - internal configuration failure
     * - explicitly raised authentication exceptions
     *
     * Your global exception filter is responsible for safely
     * handling unexpected 5xx errors.
     */
    if (error) {
      throw error;
    }

    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username/email or password',
      });
    }

    return user;
  }
}
