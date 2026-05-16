#!/usr/bin/env bash
# Back up the live database to the ZboaraSageatainFoisor branch on GitHub.
# Run from repo root: bash deploy/scripts/backup-db.sh
#
# Requirements: sqlite3 CLI, git, repo must be on ZboaraSageatainFoisor branch.
set -euo pipefail

DB=data/dartsleague.db
BRANCH=ZboaraSageatainFoisor

# Guard: must be on the right branch
CURRENT=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT" != "$BRANCH" ]; then
  echo "Error: must be on branch '$BRANCH' (currently on '$CURRENT')."
  exit 1
fi

if [ ! -f "$DB" ]; then
  echo "Error: $DB not found. Is the data/ volume mounted?"
  exit 1
fi

# Checkpoint WAL so the .db file is self-consistent
sqlite3 "$DB" ".checkpoint FULL" 2>/dev/null && echo "WAL checkpointed." || echo "sqlite3 not found — skipping checkpoint (safe if app is stopped)."

# Stage the DB file
git add "$DB"

if git diff --cached --quiet; then
  echo "No database changes since last backup — nothing to commit."
  exit 0
fi

git commit -m "db: backup $(date '+%Y-%m-%d %H:%M')"
git push

echo ""
echo "Database backed up and pushed to $BRANCH."
echo "Restore on another machine: git pull && cp data/dartsleague.db /wherever/you/need/it"
