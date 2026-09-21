#!/usr/bin/env sh
set -eu

: "${PGBACKREST_CONFIG:?PGBACKREST_CONFIG must point to a protected pgBackRest config}"
: "${PGBACKREST_STANZA:=centralized-api}"
: "${PGBACKREST_TARGET:?PGBACKREST_TARGET is required, for example 2026-09-09 12:00:00+00}"
: "${PGBACKREST_ALLOW_DESTRUCTIVE_RESTORE:?Set PGBACKREST_ALLOW_DESTRUCTIVE_RESTORE=YES deliberately to restore}"

if [ "$PGBACKREST_ALLOW_DESTRUCTIVE_RESTORE" != "YES" ]; then
  printf '%s\n' "Destructive restore requires PGBACKREST_ALLOW_DESTRUCTIVE_RESTORE=YES" >&2
  exit 2
fi

exec pgbackrest --config="$PGBACKREST_CONFIG" --stanza="$PGBACKREST_STANZA" restore --type=time --target="$PGBACKREST_TARGET" --target-action=promote --delta
