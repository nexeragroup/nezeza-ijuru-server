import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

import { API_PREFIX_PATH } from '../constants/api.constant';
import {
  csrfTokensMatch,
  generateCsrfToken,
  validCsrfToken,
} from '../utils/csrf.util';

type HttpMethod =
  'GET' | 'HEAD' | 'OPTIONS' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface CsrfExcludedRoute {
  readonly path: string;
  readonly methods?: readonly HttpMethod[];
  readonly match?: 'exact' | 'prefix';
}

const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'X-XSRF-TOKEN';

const SAFE_HTTP_METHODS = new Set<string>(['GET', 'HEAD', 'OPTIONS']);

/**
 * Keep exclusions extremely small.
 *
 * External webhooks cannot provide browser CSRF tokens,
 * so they must use their own authentication mechanism,
 * such as an HMAC/provider signature.
 */
const CSRF_EXCLUDED_ROUTES: readonly CsrfExcludedRoute[] = [
  {
    path: '/webhooks',
    methods: ['POST'],
    match: 'prefix',
  },
  {
    path: '/conferences/all',
    methods: ['GET'],
    match: 'exact',
  },
];

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const method = request.method.toUpperCase();

    /*
     * Local Postman/import convenience only. Production configuration
     * rejects this switch so browser write protections remain enabled.
     */
    if (
      method === 'POST' &&
      this.config.get<boolean>('security.disablePostCsrf', false)
    ) {
      next();
      return;
    }

    const routePath = this.getRoutePath(request);

    if (this.isExcludedRoute(method, routePath)) {
      next();
      return;
    }

    const secret = this.config.getOrThrow<string>('security.csrfSecret');

    this.assertSecretStrength(secret);

    const sessionId = request.sessionID;

    /*
     * express-session should always expose a session ID
     * after SessionMiddleware has run.
     *
     * If it does not, fail closed instead of disabling CSRF.
     */
    if (!sessionId) {
      throw new ForbiddenException({
        code: 'CSRF_SESSION_REQUIRED',
        message: 'A valid session is required',
      });
    }

    const csrfCookie = this.getCookie(request);

    const validCookie =
      csrfCookie !== null && validCsrfToken(csrfCookie, sessionId, secret);

    /*
     * Safe methods do not require a submitted CSRF token,
     * but GET/HEAD endpoints must never mutate server state.
     */
    if (!SAFE_HTTP_METHODS.has(method)) {
      const headerToken = this.normalizeToken(request.get(CSRF_HEADER_NAME));

      const tokensMatch =
        csrfCookie !== null &&
        headerToken !== null &&
        csrfTokensMatch(csrfCookie, headerToken);

      if (!validCookie || !tokensMatch) {
        throw new ForbiddenException({
          code: 'CSRF_VALIDATION_FAILED',
          message: 'Invalid or missing CSRF token',
        });
      }
    }

    /*
     * The CSRF bootstrap endpoint intentionally modifies
     * the session. This ensures saveUninitialized:false
     * persists the session whose ID the CSRF token is
     * cryptographically bound to.
     */
    if (routePath === '/auth/csrf') {
      request.session.csrfInitialized = true;

      const token =
        validCookie && csrfCookie
          ? csrfCookie
          : generateCsrfToken(sessionId, secret);

      response.setHeader('Cache-Control', 'no-store, private');

      response.setHeader('Pragma', 'no-cache');

      response.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false,

        /*
         * Required for Angular to read the token and
         * submit it through X-XSRF-TOKEN.
         */
        path: '/',

        secure: this.config.get<boolean>('security.secureCookies', false),

        sameSite: this.getSameSitePolicy(),
      });
    }

    next();
  }

  private getCookie(request: Request): string | null {
    const value: unknown = request.cookies?.[CSRF_COOKIE_NAME];

    return this.normalizeToken(value);
  }

  private normalizeToken(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();

    if (!normalized || normalized.length > 2_048) {
      return null;
    }

    return normalized;
  }

  private getSameSitePolicy(): 'lax' | 'strict' | 'none' {
    const sameSite = this.config.get<'lax' | 'strict' | 'none'>(
      'security.cookieSameSite',
      'lax',
    );

    const secure = this.config.get<boolean>('security.secureCookies', false);

    /*
     * Browsers require Secure when SameSite=None
     * is used.
     */
    if (sameSite === 'none' && !secure) {
      throw new Error(
        'security.cookieSameSite cannot be "none" when security.secureCookies is false',
      );
    }

    return sameSite;
  }

  private getRoutePath(request: Request): string {
    const requestPath = this.normalizePath(request.path);

    const prefix = this.normalizePath(API_PREFIX_PATH);

    if (requestPath === prefix) {
      return '/';
    }

    if (prefix !== '/' && requestPath.startsWith(`${prefix}/`)) {
      return this.normalizePath(requestPath.slice(prefix.length));
    }

    return requestPath;
  }

  private isExcludedRoute(method: string, requestPath: string): boolean {
    const normalizedMethod = method.toUpperCase();

    return CSRF_EXCLUDED_ROUTES.some((route) => {
      const excludedPath = this.normalizePath(route.path);

      const methodMatches =
        !route.methods?.length ||
        route.methods.some((routeMethod) => routeMethod === normalizedMethod);

      if (!methodMatches) {
        return false;
      }

      if (route.match === 'prefix') {
        return (
          requestPath === excludedPath ||
          requestPath.startsWith(`${excludedPath}/`)
        );
      }

      return requestPath === excludedPath;
    });
  }

  private normalizePath(path: string): string {
    if (!path || path === '/') {
      return '/';
    }

    const normalized = path.replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');

    return `/${normalized}`;
  }

  private assertSecretStrength(secret: string): void {
    /*
     * This checks minimum length, not actual entropy.
     * The secret should still be generated from a
     * cryptographically secure random source.
     */
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('security.csrfSecret must contain at least 32 bytes');
    }
  }
}
