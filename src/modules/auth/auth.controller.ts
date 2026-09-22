import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { generateCsrfToken } from '../../common/utils/csrf.util';
import { normalizeRoles } from '../../common/utils/role.util';
import { resolveSessionCookieName } from '../../common/utils/session-cookie.util';
import { UsersEntity } from '../users/entity/users.entity';
import { AuthService } from './auth.service';
import { ChangePassword } from './dto/change-password.dto';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';
import { EnableTwoFactor } from './dto/enable-2fa.dto';
import {
  EmailRequestDto,
  MfaLoginDto,
  ResetPasswordDto,
  TokenDto,
} from './dto/security-lifecycle.dto';
import { VerifyTwoFactor } from './dto/verify-2fa.dto';
import { LocalGuard } from './guards/local.guard';
import { SecurityLifecycleService } from './security-lifecycle.service';

/**
 * Authentication controller.
 *
 * Responsible for:
 * - CSRF initialization
 * - Login
 * - MFA login completion
 * - Logout
 * - Token refresh
 * - Password lifecycle
 * - Email verification
 * - Two-factor authentication
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly lifecycle: SecurityLifecycleService,
  ) {}

  /**
   * Initializes the CSRF/session flow.
   *
   * The CSRF middleware is responsible for issuing the
   * XSRF-TOKEN cookie.
   */
  @Public()
  @Get('csrf')
  @HttpCode(HttpStatus.OK)
  csrf(): {
    message: string;
  } {
    return {
      message: 'CSRF cookie initialized',
    };
  }

  /**
   * Requests an email-verification token.
   *
   * Always returns the same response regardless of whether
   * the account exists to prevent account enumeration.
   */
  @Public()
  @RateLimit(3)
  @Post('email-verification/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestVerification(
    @Body()
    dto: EmailRequestDto,
  ): Promise<{
    message: string;
  }> {
    await this.lifecycle.requestEmailVerification(dto.email);

    return {
      message: 'If the account exists, a verification message has been sent',
    };
  }

  /**
   * Confirms an email-verification token.
   */
  @Public()
  @Post('email-verification/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmVerification(
    @Body()
    dto: TokenDto,
  ): Promise<void> {
    await this.lifecycle.verifyEmail(dto.token);
  }

  /**
   * Requests a password-reset token.
   *
   * The response intentionally does not disclose whether
   * the email belongs to an existing account.
   */
  @Public()
  @RateLimit(3)
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body()
    dto: EmailRequestDto,
  ): Promise<{
    message: string;
  }> {
    await this.lifecycle.requestPasswordReset(dto.email);
    return {
      message: 'If the account exists, a reset message has been sent',
    };
  }

  /**
   * Completes a password reset.
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body()
    dto: ResetPasswordDto,
  ): Promise<void> {
    await this.lifecycle.resetPassword(
      dto.token,
      dto.newPassword,
      dto.confirmPassword,
    );
  }

  /**
   * Authenticates a user.
   *
   * LocalGuard validates the credentials and populates
   * request.user before this controller method executes.
   */
  @Public()
  @UseGuards(LocalGuard)
  @RateLimit(5)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Req()
    request: Request,

    @Res()
    response: Response,
  ): Promise<Response> {
    const user = this.requireLocalUser(request);

    const data = await this.authService.login(
      user,
      request.ip,
      request.get('user-agent'),
    );

    /*
     * Do not establish the authenticated session yet when
     * MFA is still required.
     */
    if ('mfaRequired' in data) {
      response.setHeader('Cache-Control', 'no-store');

      return response.json({
        message: 'MFA required',
        data,
      });
    }

    /*
     * Session fixation protection:
     *
     * Credentials have been validated, therefore throw away
     * the pre-authentication session identifier before
     * creating the authenticated session.
     */
    await this.regenerateSession(request);

    request.session.user = {
      id: user.id,
      username: user.username,
      roles: normalizeRoles(user.roles),
    };

    const csrfToken = this.createCsrfToken(request.sessionID);

    this.setAuthCookies(response, data.refreshToken, csrfToken);

    return response.json({
      message: 'Login successful',

      data: {
        accessToken: data.accessToken,

        payload: data.payload,
      },
    });
  }

  /**
   * Completes an MFA-protected login.
   */
  @Public()
  @RateLimit(5)
  @Post('mfa/complete')
  @HttpCode(HttpStatus.OK)
  async completeMfa(
    @Body()
    dto: MfaLoginDto,

    @Req()
    request: Request,

    @Res()
    response: Response,
  ): Promise<Response> {
    const data = await this.authService.completeMfa(
      dto.token,
      dto.code,
      request.ip,
      request.get('user-agent'),
    );

    /*
     * Rotate the session identifier after MFA succeeds.
     */
    await this.regenerateSession(request);

    this.setAuthCookies(
      response,
      data.refreshToken,
      this.createCsrfToken(request.sessionID),
    );

    return response.json({
      message: 'Login successful',

      data: {
        accessToken: data.accessToken,

        payload: data.payload,
      },
    });
  }

  /**
   * Invalidates the authenticated user's refresh/session state.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('sub')
    userId: string,

    @Req()
    request: Request,

    @Res()
    response: Response,
  ): Promise<Response> {
    /*
     * Revoke server-side authentication state first.
     */
    await this.authService.logout(userId);

    /*
     * Destroy the browser session.
     */
    await this.destroySession(request);

    /*
     * Clear all authentication-related cookies using the same
     * cookie attributes used when they were created.
     */
    response.clearCookie('refresh_token', this.cookieOptions(true));

    response.clearCookie('XSRF-TOKEN', this.csrfCookieOptions());

    response.clearCookie(this.getSessionCookieName(), this.cookieOptions(true));

    response.setHeader('Cache-Control', 'no-store');

    return response.json({
      message: 'Logout successful',
    });
  }

  /**
   * Changes the authenticated user's password.
   */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('username')
    username: string,

    @Body()
    dto: ChangePassword,
  ): Promise<void> {
    await this.authService.changePassword(username, dto);
  }

  /**
   * Starts two-factor authentication enrollment.
   */
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  async enableTwoFactor(
    @CurrentUser('sub')
    userId: string,

    @Body()
    dto: EnableTwoFactor,
  ): Promise<{
    qrCode: string | undefined;
    manualKey: string;
  }> {
    return this.authService.enableTwoFactor(userId, dto);
  }

  /**
   * Verifies the pending two-factor enrollment.
   */
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactor(
    @CurrentUser('sub')
    userId: string,

    @Body()
    dto: VerifyTwoFactor,
  ): Promise<void> {
    await this.authService.verifyTwoFactor(userId, dto);
  }

  /**
   * Disables two-factor authentication.
   */
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  async disableTwoFactor(
    @CurrentUser('sub')
    userId: string,

    @Body()
    dto: DisableTwoFactorDto,
  ): Promise<void> {
    await this.authService.disableTwoFactor(userId, dto);
  }

  /**
   * Rotates the refresh token and issues a fresh access token.
   */
  @Public()
  @RateLimit(10)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req()
    request: Request,

    @Res()
    response: Response,
  ): Promise<Response> {
    const refreshToken = this.getRefreshToken(request);

    const data = await this.authService.refreshToken(
      refreshToken,
      request.ip,
      request.get('user-agent'),
    );

    /*
     * Ensure the session is considered initialized when
     * saveUninitialized=false is configured.
     */
    request.session.csrfInitialized = true;

    this.setAuthCookies(
      response,
      data.refreshToken,
      this.createCsrfToken(request.sessionID),
    );

    return response.json({
      message: 'Token refreshed successfully',

      data: {
        accessToken: data.accessToken,

        payload: data.payload,
      },
    });
  }

  /**
   * LocalGuard should always populate request.user before login()
   * executes. We still validate the boundary rather than relying on
   * an unsafe `as UsersEntity` assertion.
   */
  private requireLocalUser(request: Request): UsersEntity {
    const user = request.user as UsersEntity | undefined;

    if (
      !user ||
      typeof user.id !== 'string' ||
      !user.id ||
      typeof user.username !== 'string' ||
      !user.username
    ) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',

        message: 'Authentication is required',
      });
    }

    return user;
  }

  /**
   * Reads and validates the refresh-token cookie.
   */
  private getRefreshToken(request: Request): string {
    const value = request.cookies?.['refresh_token'];

    if (typeof value !== 'string' || !value.trim()) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REQUIRED',

        message: 'Refresh token is required',
      });
    }

    /*
     * Bound unexpected cookie size before sending it deeper into
     * the authentication subsystem.
     */
    if (value.length > 8_192) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',

        message: 'Refresh token is invalid',
      });
    }

    return value;
  }

  /**
   * Regenerates the Express session to protect against
   * session-fixation attacks.
   */
  private async regenerateSession(request: Request): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      request.session.regenerate((error) => {
        if (error) {
          reject(
            error instanceof Error
              ? error
              : new Error('Failed to regenerate session'),
          );

          return;
        }

        resolve();
      });
    });

    /*
     * Required when express-session is configured with
     * saveUninitialized=false.
     */
    request.session.csrfInitialized = true;
  }

  /**
   * Destroys the current Express session.
   */
  private async destroySession(request: Request): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((error) => {
        if (error) {
          reject(
            error instanceof Error
              ? error
              : new Error('Failed to destroy session'),
          );

          return;
        }

        resolve();
      });
    });
  }

  /**
   * Generates a CSRF token bound to the current session.
   */
  private createCsrfToken(sessionId: string): string {
    return generateCsrfToken(
      sessionId,
      this.config.getOrThrow<string>('security.csrfSecret'),
    );
  }

  /**
   * Issues authentication cookies.
   */
  private setAuthCookies(
    response: Response,
    refreshToken: string,
    csrfToken: string,
  ): void {
    /*
     * Authentication responses must never be cached by an
     * intermediary or browser cache.
     */
    response.setHeader('Cache-Control', 'no-store');

    response.setHeader('Pragma', 'no-cache');

    response.cookie('refresh_token', refreshToken, this.cookieOptions(true));

    /*
     * Angular/browser code must be able to read this token and
     * return it using X-XSRF-TOKEN, therefore httpOnly=false.
     */
    response.cookie('XSRF-TOKEN', csrfToken, this.csrfCookieOptions());
  }

  /**
   * Central cookie policy.
   *
   * Refresh-token and CSRF cookies must use the same Secure,
   * SameSite, and Path policy expected by the application.
   */
  private cookieOptions(httpOnly: boolean): CookieOptions {
    const secure = this.config.get<boolean>('security.secureCookies', false);

    const sameSite = this.config.get<'lax' | 'strict' | 'none'>(
      'security.cookieSameSite',
      'lax',
    );

    if (sameSite === 'none' && !secure) {
      throw new Error(
        'SameSite=None cookies require security.secureCookies=true',
      );
    }

    return {
      httpOnly,
      secure,
      sameSite,
      path: '/',
    };
  }

  private csrfCookieOptions(): CookieOptions {
    return {
      ...this.cookieOptions(false),
      domain:
        this.config.get<string>('security.csrfCookieDomain') || undefined,
    };
  }

  private getSessionCookieName(): string {
    return resolveSessionCookieName({
      applicationName: this.config.get<string>('app.name', 'application'),
      configuredCookieName: this.config.get<string>(
        'security.sessionCookieName',
      ),
      secureCookies: this.config.get<boolean>('security.secureCookies', false),
    });
  }
}
