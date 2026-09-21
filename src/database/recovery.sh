#!/usr/bin/env sh
set -eu

: "${PGBACKREST_CONFIG:?PGBACKREST_CONFIG must point to a protected pgBackRest config}"
: "${PGBACKREST_STANZA:=centralized-api}"

printf '%s\n' "Recovery is an operator action. Use restore.sh with an explicit PGBACKREST_TARGET and destructive acknowledgement."
printf '%s\n' "Validate repository availability with: pgbackrest --config=\"$PGBACKREST_CONFIG\" --stanza=\"$PGBACKREST_STANZA\" check"
