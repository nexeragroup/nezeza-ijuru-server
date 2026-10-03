# Server deployment

This stack deploys the API, PostgreSQL, and Redis. It does not create a Gateway service.

| Environment | API domain                    | Loopback API port | API container                 |
| ----------- | ----------------------------- | ----------------- | ----------------------------- |
| Staging     | `staging-api.nezezaijuru.org` | `10261`           | `nezeza-ijuru-server-staging` |
| Production  | `api.nezezaijuru.org`         | `10251`           | `nezeza-ijuru-server-prod`    |

Data persists beneath the deployment root:

```text
/home/yves/nezeza-ijuru/<environment>/data/
├── postgres
├── redis
└── storage
```

## Upgrade from the previous secret layout

Before the first deployment with this layout, move the existing host-only runtime files out of `deploy/`. The workflow checks for the new paths before it synchronizes source, so it stops safely until this is complete.

```bash
mv /home/yves/nezeza-ijuru/staging/server/deploy/.env.staging \
  /home/yves/nezeza-ijuru/staging/server/.env.staging
mv /home/yves/nezeza-ijuru/prod/server/deploy/.env.production \
  /home/yves/nezeza-ijuru/prod/server/.env.prod
chmod 600 /home/yves/nezeza-ijuru/staging/server/.env.staging \
  /home/yves/nezeza-ijuru/prod/server/.env.prod
```

## First host deployment

1. Provision the root-level `.env.staging` or `.env.prod` runtime file securely on the host. Do not commit it. The checked-in `deploy/.env.staging` and `deploy/.env.prod` files contain only Compose metadata.

   ```bash
   cd /home/yves/nezeza-ijuru/staging/server
   chmod 600 .env.staging
   ```

   `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` initialize PostgreSQL only when its data directory is empty. They must exactly match the corresponding `DATABASE_*` values in that same root runtime file.

2. Install the matching `nginx/` file on the host, provision its TLS certificate, and validate Nginx.

   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

3. Start the stack. Compose creates an environment-local backend network, runs the one-shot migration service, seeds the default administrator, then starts the API only after both jobs succeed.

   ```bash
   docker compose --env-file deploy/.env.staging -f deploy/compose.staging.yml up -d --build
   docker compose --env-file deploy/.env.staging -f deploy/compose.staging.yml ps migrate seed-default-admin
   ```

   Both `migrate` and `seed-default-admin` should finish with exit code `0`. Their stopped state is expected; they are release jobs, not long-running processes. The seed is idempotent: it grants all default permissions to the `ADMIN` and `DEVELOPER` roles and creates the configured default administrator only when it does not already exist.

   The root runtime file must contain `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` before the first deployment. If the database already has application tables but no TypeORM migration history, stop here and use the reviewed `db:baseline-existing` procedure; do not run the restored migrations against an untracked schema.

4. Verify readiness through the intended public host.

   ```bash
   curl --fail https://staging-api.nezezaijuru.org/api/v1/health/ready
   ```

Production uses root `.env.prod`, `deploy/.env.prod`, the prod Compose file, and `api.nezezaijuru.org`.

## Deployment secret contract

GitHub Actions expects `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_SSH_KEY`, and `DEPLOY_KNOWN_HOSTS` in the corresponding GitHub environment. The workflows deploy the `staging` and `production` branches respectively. The root runtime environment file remains on the target host and is intentionally excluded from synchronization.

`DATABASE_SYNCHRONIZE` and `DATABASE_MIGRATIONS` must remain `false` for the API process. The Compose `migrate` and `seed-default-admin` services are deliberate, observable release steps and must complete successfully before the API starts. The resource and log-retention limits in `deploy/.env.*` are safe initial caps; size them to the host before a high-volume release.
