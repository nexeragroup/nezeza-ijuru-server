import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import basicAuth from 'express-basic-auth';
import helmet from 'helmet';

import { API_PREFIX } from './common/constants/api.constant';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { SessionMiddleware } from './common/middleware/session.middleware';

export interface HttpApplicationConfiguration {
  readonly apiPrefix: string;
  readonly apiPath: string;
  readonly swaggerPath?: string;
}

/**
 * Configures the HTTP-facing NestJS application.
 *
 * This function is intentionally not used by worker-only processes.
 */
export function configureHttpApplication(
  app: NestExpressApplication,
): HttpApplicationConfiguration {
  const config = app.get(ConfigService);

  const apiPrefix = normalizePathSegment(API_PREFIX, 'API_PREFIX');

  const apiPath = `/${apiPrefix}`;

  /*
   * ---------------------------------------------------------------
   * Core HTTP configuration
   * ---------------------------------------------------------------
   */

  app.setGlobalPrefix(apiPrefix);

  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);

  /*
   * Do not expose the underlying Express implementation.
   */
  app.disable('x-powered-by');

  configureTrustProxy(app, config);

  /*
   * Security headers should be registered before application
   * routes and middleware responses.
  */
  if (config.get<boolean>('security.helmetEnabled', true)) {
    app.use(
      helmet({
        crossOriginResourcePolicy: {
          policy: 'cross-origin',
        },
      }),
    );
  }

  configureCors(app, config);

  /*
   * ---------------------------------------------------------------
   * Cookie -> Session -> CSRF
   * ---------------------------------------------------------------
   *
   * Order is security-sensitive:
   *
   * cookie-parser
   *      ↓
   * express-session
   *      ↓
   * CSRF middleware
   */

  /*
   * No signing secret is passed to cookie-parser.
   *
   * express-session signs its own session cookie and the CSRF
   * implementation authenticates its own token separately.
   */
  app.use(cookieParser());

  const sessionMiddleware = app.get(SessionMiddleware);

  app.use(sessionMiddleware.use.bind(sessionMiddleware));

  const csrfMiddleware = app.get(CsrfMiddleware);

  app.use(csrfMiddleware.use.bind(csrfMiddleware));

  /*
   * ---------------------------------------------------------------
   * Global input validation
   * ---------------------------------------------------------------
   */

  app.useGlobalPipes(
    new ValidationPipe({
      /*
       * Remove properties that are not declared in the DTO.
       */
      whitelist: true,

      /*
       * Reject unexpected properties instead of silently
       * discarding them.
       */
      forbidNonWhitelisted: true,

      /*
       * Reject unsupported unknown object values.
       */
      forbidUnknownValues: true,

      /*
       * Transform request payloads into DTO instances.
       */
      transform: true,

      /*
       * Avoid broad implicit coercion such as:
       *
       * "false" -> true
       *
       * Use explicit DTO transformations where required.
       */
      transformOptions: {
        enableImplicitConversion: false,
      },

      /*
       * Do not expose complete request values in validation
       * error metadata.
       */
      validationError: {
        target: false,
        value: false,
      },

      stopAtFirstError: false,
    }),
  );

  /*
   * ---------------------------------------------------------------
   * Swagger / OpenAPI
   * ---------------------------------------------------------------
   */

  const swaggerPath = configureSwagger(app, config, apiPrefix);

  return {
    apiPrefix,
    apiPath,
    swaggerPath,
  };
}

function configureTrustProxy(
  app: NestExpressApplication,
  config: ConfigService,
): void {
  /*
   * Preferred configuration.
   *
   * 0 -> NestJS directly exposed
   * 1 -> Internet -> Nginx -> NestJS
   * 2 -> Internet -> Load Balancer -> Nginx -> NestJS
   */
  const configuredHops = config.get<number>('security.trustProxyHops');

  /*
   * Temporary backward compatibility with the previous
   * boolean security.trustProxy configuration.
   */
  const legacyTrustProxy = config.get<boolean>('security.trustProxy', false);

  const hops = configuredHops ?? (legacyTrustProxy ? 1 : 0);

  if (!Number.isSafeInteger(hops) || hops < 0 || hops > 16) {
    throw new Error(
      'security.trustProxyHops must be an integer between 0 and 16',
    );
  }

  app.set('trust proxy', hops === 0 ? false : hops);
}

function configureCors(
  app: NestExpressApplication,
  config: ConfigService,
): void {
  const origins = normalizeStringArray(
    config.get<string[] | string>('cors.origins', []),
  );

  const methods = normalizeStringArray(
    config.get<string[] | string>('cors.methods', [
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ]),
  );

  const allowedHeaders = normalizeStringArray(
    config.get<string[] | string>('cors.allowedHeaders', [
      'Authorization',
      'Content-Type',
      'X-API-Key',
      'X-Request-Id',
      'X-Trace-Id',
      'X-XSRF-TOKEN',
    ]),
  );

  const exposedHeaders = normalizeStringArray(
    config.get<string[] | string>('cors.exposedHeaders', [
      'X-Request-Id',
      'X-Trace-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
    ]),
  );

  const credentials = config.get<boolean>('cors.credentials', false);

  if (credentials && origins.includes('*')) {
    throw new Error(
      'CORS wildcard origin cannot be used when credentials are enabled',
    );
  }

  const maxAge = config.get<number>('cors.maxAge', 86_400);

  if (!Number.isSafeInteger(maxAge) || maxAge < 0) {
    throw new Error('cors.maxAge must be a non-negative integer');
  }

  app.enableCors({
    /*
     * Empty allowed-origin configuration means browsers
     * cannot make cross-origin calls.
     */
    origin: origins.length > 0 ? origins : false,

    credentials,

    methods,

    allowedHeaders,

    exposedHeaders,

    maxAge,
  });
}

function configureSwagger(
  app: NestExpressApplication,
  config: ConfigService,
  apiPrefix: string,
): string | undefined {
  const environment = config.get<string>(
    'app.environment',
    process.env.NODE_ENV ?? 'development',
  );

  /*
   * Prefer namespaced application configuration.
   *
   * SWAGGER_* fallback keeps compatibility with the current
   * environment/configuration until everything has been moved
   * into swagger.config.ts.
   */
  const enabled =
    config.get<boolean>('swagger.enabled') ??
    config.get<boolean>('SWAGGER_ENABLED', environment !== 'production');

  if (!enabled) {
    return undefined;
  }

  const authEnabled =
    config.get<boolean>('swagger.authEnabled') ??
    config.get<boolean>('SWAGGER_AUTH_ENABLED', environment === 'production');

  /*
   * Never allow accidentally-public Swagger documentation
   * in production.
   */
  if (environment === 'production' && !authEnabled) {
    throw new Error(
      'Swagger authentication must be enabled when Swagger is enabled in production',
    );
  }

  const configuredDocsPath =
    config.get<string>('swagger.path') ??
    config.get<string>('SWAGGER_PATH', 'docs');

  const docsPath = normalizePathSegment(configuredDocsPath, 'swagger.path');

  const fullDocsPath = `/${apiPrefix}/${docsPath}`;

  /*
   * Protect both the Swagger UI and the raw OpenAPI documents.
   */
  if (authEnabled) {
    const username = (
      config.get<string>('swagger.username') ??
      config.getOrThrow<string>('SWAGGER_USERNAME')
    ).trim();

    const password =
      config.get<string>('swagger.password') ??
      config.getOrThrow<string>('SWAGGER_PASSWORD');

    if (!username) {
      throw new Error('Swagger username cannot be empty');
    }

    if (password.length < 16) {
      throw new Error('Swagger password must contain at least 16 characters');
    }

    app.use(
      [fullDocsPath, `${fullDocsPath}-json`, `${fullDocsPath}-yaml`],

      basicAuth({
        challenge: true,

        realm: 'API Documentation',

        users: {
          [username]: password,
        },

        unauthorizedResponse: 'Unauthorized',
      }),
    );
  }

  const title = config.get<string>(
    'swagger.title',
    config.get<string>('app.name', 'Domain API'),
  );

  const description = config.get<string>(
    'swagger.description',
    'Centralized NestJS API',
  );

  const version = config.get<string>('app.version', '1.0.0');

  const swaggerConfig = new DocumentBuilder()
    .setTitle(title)
    .setDescription(description)
    .setVersion(version)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'bearer',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
      },
      'api-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup(docsPath, app, document, {
    useGlobalPrefix: true,

    raw: ['json', 'yaml'],

    swaggerOptions: {
      /*
       * Do not permanently store JWTs/API keys in the
       * browser's Swagger UI state.
       */
      persistAuthorization: false,

      displayRequestDuration: true,

      filter: true,
    },
  });

  return fullDocsPath;
}

function normalizeStringArray(value: string[] | string | undefined): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))];
}

function normalizePathSegment(value: string, name: string): string {
  const normalized = value
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');

  if (!normalized) {
    throw new Error(`${name} cannot be empty`);
  }

  const segments = normalized.split('/');

  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`${name} contains an invalid path segment`);
  }

  return normalized;
}
