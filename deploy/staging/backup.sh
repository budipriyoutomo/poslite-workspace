#!/bin/bash
# Nightly PostgreSQL backup (custom format, restorable with pg_restore) plus the local media volume.
# Keeps KEEP_DAYS days. Cron on the VPS, e.g.:
#   15 19 * * * /opt/poslite/deploy/staging/backup.sh >> /var/log/poslite-backup.log 2>&1
# (19:15 UTC = 02:15 WIB, after the business-day cutoff.) Copy BACKUP_DIR off the VPS as well.
set -euo pipefail

cd "$(dirname "$0")"
BACKUP_DIR=${BACKUP_DIR:-/var/backups/poslite}
KEEP_DAYS=${KEEP_DAYS:-14}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_DIR"

docker compose exec -T postgres pg_dump -U postgres -d poslite -Fc > "$BACKUP_DIR/poslite-$stamp.dump"
docker compose exec -T api tar -C /app/var -czf - media > "$BACKUP_DIR/media-$stamp.tar.gz"

find "$BACKUP_DIR" -type f \( -name 'poslite-*.dump' -o -name 'media-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) backup ok: poslite-$stamp.dump"
