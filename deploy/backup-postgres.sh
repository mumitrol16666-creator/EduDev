#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/edudev}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-maestro-postgres}"
POSTGRES_USER="${POSTGRES_USER:-edudev}"
POSTGRES_DB="${POSTGRES_DB:-edudev_crm}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date '+%Y-%m-%d_%H-%M-%S')"
backup_file="$BACKUP_DIR/${POSTGRES_DB}_${timestamp}.sql.gz"

docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$backup_file"
chmod 600 "$backup_file"

find "$BACKUP_DIR" -type f -name "${POSTGRES_DB}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

printf 'Created backup: %s\n' "$backup_file"
