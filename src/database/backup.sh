#!/usr/bin/env sh
set -eu

: "${PGBACKREST_CONFIG:?PGBACKREST_CONFIG must point to a protected pgBackRest config}"
: "${PGBACKREST_STANZA:=centralized-api}"
: "${PGBACKREST_BACKUP_TYPE:=diff}"

case "$PGBACKREST_BACKUP_TYPE" in
  full|diff|incr) ;;
  *) printf '%s\n' "PGBACKREST_BACKUP_TYPE must be full, diff, or incr" >&2; exit 2 ;;
esac

exec pgbackrest --config="$PGBACKREST_CONFIG" --stanza="$PGBACKREST_STANZA" backup --type="$PGBACKREST_BACKUP_TYPE"
