#!/usr/bin/env bash
# SQLite WAL-safe backup — runs via systemd timer
set -euo pipefail

DB_SRC=${DB_PATH:-/var/lib/dartsleague/dartsleague.db}
BACKUP_DIR=${BACKUP_DIR:-/media/pi/backup/dartsleague}
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"

DEST="$BACKUP_DIR/dartsleague-$(date +%Y%m%d-%H%M%S).db"

# Use SQLite's .backup command for WAL-safe copy
sqlite3 "$DB_SRC" ".backup '$DEST'"

# Remove old backups
find "$BACKUP_DIR" -name 'dartsleague-*.db' -mtime +"$KEEP_DAYS" -delete

echo "Backup written: $DEST"
