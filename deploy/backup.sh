#!/bin/sh
# Nightly PostgreSQL backup, with retention.
#
# This runs INSIDE the `db` container, not on the host. That is deliberate:
# pg_dump only ships with PostgreSQL itself, and a host-installed client can be
# a different major version from the server, which makes it refuse to dump. By
# running here, the dump always comes from the exact image the database runs.
#
# Host cron entry (installed once):
#
#   docker exec kalisizo-coffee-db-1 /opt/kalisizo/backup.sh >> /var/log/kalisizo-backup.log 2>&1
#
# The compose file bind-mounts this script and the backup directory into the
# container, so nothing needs copying by hand after a redeploy.
#
# Custom format rather than plain SQL: compressed, and `pg_restore -t table` can
# recover a single table without dumping the database again.
#
# Scope: the database only. Uploaded images live in the separate `uploads`
# volume and are not covered here.

set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"

# The container's own environment already carries these; PGPASSWORD is how
# pg_dump takes the password without it appearing in `ps` output.
export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="${BACKUP_DIR}/kalisizo-${TIMESTAMP}.dump"
TMP="${TARGET}.partial"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

mkdir -p "$BACKUP_DIR"

# Written to a temporary name and moved into place only after it verifies. A
# partial dump is worse than no dump, because it looks like success.
trap 'rm -f "$TMP"' EXIT INT TERM

log "starting -> ${TARGET}"

# --no-owner keeps the dump restorable under a differently-named role, which is
# what makes it usable on a replacement server after a migration.
pg_dump \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --format=custom \
  --compress=9 \
  --no-owner \
  > "$TMP"

SIZE_BYTES="$(wc -c < "$TMP" | tr -d ' ')"
if [ "$SIZE_BYTES" -lt 1024 ]; then
  log "ERROR: dump is only ${SIZE_BYTES} bytes, refusing to keep it"
  exit 1
fi

# Confirm the archive is readable, not merely present. A truncated dump fails
# here and nowhere else until the day it is needed.
if ! pg_restore --list "$TMP" > /dev/null 2>&1; then
  log "ERROR: pg_restore could not read the dump, refusing to keep it"
  exit 1
fi

mv "$TMP" "$TARGET"
trap - EXIT INT TERM

log "verified ${SIZE_BYTES} bytes at ${TARGET}"

# Retention. The glob only matches files this script created, so an unrelated
# file in the directory is never removed.
find "$BACKUP_DIR" -maxdepth 1 -name 'kalisizo-*.dump' -type f -mtime "+${RETENTION_DAYS}" -delete
log "pruned dumps older than ${RETENTION_DAYS} days"

# ---------------------------------------------------------------------------
# Restore, from the host
# ---------------------------------------------------------------------------
# Stop the app first, or it keeps serving from the old data while the restore is
# half-applied:
#
#   docker compose stop app
#   docker compose exec -T db pg_restore --username=kalisizo \
#     --dbname=kalisizo_coffee --clean --if-exists \
#     < /var/backups/kalisizo/<timestamp>.dump
#   docker compose start app