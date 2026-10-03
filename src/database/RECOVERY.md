# Database Recovery Runbook

These assets prepare pgBackRest operations; they do not provision storage, execute backups, run migrations, or restore a database.

## Proposed policy

- Full backup weekly, differential backup daily, and WAL archiving continuously.
- Keep off-server encrypted backups in S3-compatible storage with at least four full and fourteen differential retention points.
- Verify backup manifests and perform an isolated restore drill at least quarterly.
- Recovery Point Objective depends on WAL archiving health. Replication is not a backup.
- Recovery Time Objective depends on the database size, storage throughput, and restore drill results.

## Setup

1. Render `pgbackrest.conf.example` through the deployment secret manager.
2. Configure PostgreSQL `archive_mode`, `archive_command`, and WAL retention according to the database operator's process.
3. Mount the protected config and set `PGBACKREST_CONFIG`.
4. Run `pgbackrest --config="$PGBACKREST_CONFIG" --stanza=centralized-api stanza-create` outside this application deployment.
5. Schedule `backup.sh` and monitor backup freshness, WAL archive failures, and repository capacity.

## Restore

Use `restore.sh` only against an isolated or deliberately selected target. It requires both an explicit `PGBACKREST_TARGET` and `PGBACKREST_ALLOW_DESTRUCTIVE_RESTORE=YES`. Never run it as part of NestJS startup.

Backup credentials are not loaded by NestJS. The backup runtime must use separate credentials, bucket permissions, encryption secrets, and retention controls from application object storage.
