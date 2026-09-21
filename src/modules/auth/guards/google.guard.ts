import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleGuard extends AuthGuard('google') {
  /**
   * Authentication state is managed by the application rather
   * than Passport's built-in session mechanism.
   */
  override getAuthenticateOptions(_context: ExecutionContext): {
    session: false;
  } {
    return { session: false };
  }

  /**
   * Normalizes Google authentication failures.
   *
   * The guard deliberately does not expose Passport's `info`
   * object because it may contain provider-specific information
   * that should remain internal.
   */
  override handleRequest<TUser>(
    error: unknown,
    user: TUser | false | null | undefined,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    /*
     * Preserve infrastructure or application errors.
     *
     * The global exception filter will prevent unexpected
     * internal details from leaking to clients.
     */
    if (error) {
      throw error;
    }

    if (!user) {
      throw new UnauthorizedException({
        code: 'GOOGLE_AUTHENTICATION_FAILED',
        message: 'Google authentication failed',
      });
    }

    return user;
  }
}
