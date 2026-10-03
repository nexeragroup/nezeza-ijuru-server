# Nezeza Ijuru Server

The server is the NestJS API and background-processing application for Nezeza Ijuru. It owns authentication, authorization, operational data, auditability, media storage, notifications, and the public API consumed by the Client and Control applications.

All HTTP endpoints are rooted at `/api/v1`.

## Capabilities

- JWT access tokens with refresh/session cookies, CSRF protection, MFA, password lifecycle, and account lockout controls
- Role- and permission-based authorization
- Conference, programme, event, session, venue, attendee, invitee, invitation, media, update, and site-setting management
- PostgreSQL persistence through TypeORM, Redis-backed sessions/cache/queues, and outbox/worker processing
- Local or S3-compatible media storage
- Health endpoints, structured request context, audit logs, rate limiting, validation, and optional protected OpenAPI documentation

## Prerequisites

- A recent Node.js LTS runtime and pnpm 12.3.4
- PostgreSQL with the `pgcrypto` extension available
- Redis
- Environment configuration for the target environment

Enable the pinned package manager if necessary:

```bash
corepack enable
corepack prepare pnpm@12.3.4 --activate
```

## Quick start

```bash
cd server
pnpm install --frozen-lockfile
pnpm run start:dev
```

The development configuration loads `.env.dev`. Its default integration contract is:

```text
Server:  http://localhost:3300/api/v1
Control: http://localhost:4200 → /api/v1 proxy → server
Client:  http://localhost:4200 → /api/v1 proxy → server
```

Run Client and Control on different ports when both are needed.

## API and process roles

| Endpoint or command        | Purpose                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`  | Liveness check; does not depend on infrastructure.                                  |
| `GET /api/v1/health/ready` | Readiness check; reports `503` if required dependencies are unavailable.            |
| `GET /api/v1/health`       | Detailed readiness response.                                                        |
| `/api/v1/docs`             | OpenAPI UI when `SWAGGER_ENABLED=true`; protect it in non-development environments. |
| `pnpm run start:api`       | Run only the HTTP API role.                                                         |
| `pnpm run start:worker`    | Run background worker processing only.                                              |
| `pnpm run start:all`       | Run HTTP and worker responsibilities together.                                      |

Use separate API and worker processes in production when their resource needs or scaling characteristics differ.

## Environment configuration

Configuration is validated at startup by `src/config/validation.ts`. The application loads `.env.dev`, `.env.staging`, or `.env.prod` according to `NODE_ENV`, then `.env` as an override.

The most important settings are grouped below. Use your secret manager for all credentials; never commit a real production value.

| Area             | Required operational settings                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Application      | `NODE_ENV`, `APP_URL`, `HOST`, `PORT`, `APP_ROLE`                                                           |
| Authentication   | `JWT_SECRET`, `SESSION_SECRET`, `CSRF_SECRET`, `MFA_ENCRYPTION_KEY`                                         |
| Initial admin    | `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD`, optional name and username fields                          |
| Database         | `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `DATABASE_NAME`, `DATABASE_SSL` |
| Redis            | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS`, `REDIS_NAMESPACE`                                |
| Browser contract | `CORS_ORIGIN`, `CORS_CREDENTIALS`, `SECURE_COOKIES`, `COOKIE_SAME_SITE`, `TRUST_PROXY_HOPS`                 |
| Storage          | `STORAGE_PROVIDER`, local path or S3 endpoint/bucket/credentials                                            |
| Mail             | `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`                                         |

Production requirements:

- Use unique, high-entropy secrets (the schema requires 32+ characters for core JWT/session/CSRF secrets).
- Set `SECURE_COOKIES=true` behind HTTPS and set the correct `TRUST_PROXY_HOPS` for the deployed proxy chain.
- Set `CORS_ORIGIN` to exact Client and Control origins—never `*` when credentials are enabled.
- Keep `DATABASE_SYNCHRONIZE=false`; use reviewed migrations.
- Ensure `APP_URL` matches the API's externally reachable origin because generated media URLs depend on it.

## Database lifecycle

TypeORM discovers migrations in `src/database/migrations/`. API processes keep `DATABASE_MIGRATIONS=false`; migration execution is a separate, observable release step.

```bash
# Compile and validate migration expectations
pnpm run test:migrations

# Apply pending migrations to the environment selected by NODE_ENV
pnpm run db:migrate

# Build and create/verify the default administrator workflow
pnpm run seed:default-admin
```

The staging and production Compose stacks run the same `migrate` job and then the idempotent `seed-default-admin` job before the API starts. The seed applies all default permissions to the `ADMIN` and `DEVELOPER` roles and creates the configured default administrator when absent; it does not replace an existing administrator password. Do not enable schema synchronization or automatic migrations in a long-running API process.

For an existing schema with no TypeORM migration history, do not run the restored migration chain. First use the reviewed `db:baseline-existing` procedure after it confirms there is no schema drift.

## Security model

The HTTP bootstrap enforces the following order:

```text
Helmet → CORS → cookie parser → Redis session → CSRF → validation → routes
```

- Unsafe requests require a valid server session and matching `XSRF-TOKEN` cookie / `X-XSRF-TOKEN` header, except the deliberately limited login and webhook exceptions.
- The global validation pipe strips and rejects unexpected input properties.
- Authorization is enforced on the server with roles and granular permissions; front-end guards only improve navigation.
- Cookies are host-scoped unless a domain is explicitly configured by infrastructure. A front end on another API subdomain cannot read a host-scoped CSRF cookie, so use a same-origin reverse proxy or implement and test an explicit CSRF-token response flow.

## Commands

```bash
# Development and debugging
pnpm run start:dev
pnpm run start:debug

# Build and runtime modes
pnpm run build
pnpm run start:staging
pnpm run start:prod
pnpm run start:worker:prod

# Quality checks
pnpm run lint
pnpm run test
pnpm run test:cov
pnpm run test:http
pnpm run test:migrations
pnpm run db:migrate

# Formatting
pnpm run format
```

## Deploy safely

1. Build and run the test suite.
2. Verify production environment variables and secret-store references.
3. Run the reviewed migration and default-administrator seed jobs, and confirm both exit successfully before the API is started.
4. Deploy the worker and API roles.
5. Check `/api/v1/health/ready` through the production reverse proxy.
6. Verify sign-in, a permission-protected read, and one CSRF-protected write from each browser application.
7. Monitor application logs, queue failures, outbox backlog, Redis connectivity, and database pool saturation.

## Deployment assets

The Server deployment is self-contained in [`deploy/`](deploy/): API on loopback port `10261` for staging and `10251` for production, a private Compose network for the API/PostgreSQL/Redis stack, storage data paths, Nginx host configurations, and GitHub Actions workflows. It deliberately does not create a Gateway service.

The root `.env.staging` and `.env.prod` runtime files are host-provisioned secrets, ignored by Git, and preserved by the deployment workflow. The versioned `deploy/.env.staging` and `deploy/.env.prod` files contain only Compose metadata, never credentials. The `POSTGRES_*` initialization values must match the corresponding `DATABASE_*` values in the runtime file.

## Troubleshooting

| Symptom                                  | Check                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Client receives `502` from its dev proxy | Verify this server is running on the port configured in the front-end proxy (normally 3300).                                                |
| Browser write returns `403` CSRF error   | Confirm cookies are sent, `X-XSRF-TOKEN` matches the cookie, CORS permits the exact origin, and proxy/cookie settings match the deployment. |
| Browser write returns `401` or `403`     | Inspect the access token, user roles/permissions, and account status.                                                                       |
| Readiness returns `503`                  | Check PostgreSQL and Redis connectivity, credentials, TLS settings, and migration state.                                                    |
| Media URL is wrong                       | Align `APP_URL` with the external API origin and verify storage configuration.                                                              |
| Startup rejects configuration            | Read the Joi validation message; configuration is intentionally fail-closed.                                                                |

## Code map

```text
src/
├── common/     guards, decorators, middleware, security and shared services
├── config/     validated environment configuration
├── database/   TypeORM setup, migrations, audit subscriber, operational scripts
├── modules/    cross-cutting domains: auth, users, roles, permissions, health, storage
└── features/   conference and content-management business capabilities
```

Keep controllers thin, validate DTOs at the boundary, put state transitions in services, and add permission checks at the server route that performs the operation.
