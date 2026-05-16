#!/usr/bin/env bash
# DartsLeague — Docker quick-install
# Run from the repo root: bash deploy/scripts/install-docker.sh
set -euo pipefail

echo "=== DartsLeague Docker Install ==="

# 1. Check Docker is available
if ! command -v docker &>/dev/null; then
  echo "Error: Docker is not installed. Install Docker Desktop or Docker Engine first."
  exit 1
fi

# 2. Create local data directory (persists the SQLite database across restarts)
mkdir -p data
echo "Data directory ready: $(pwd)/data"

# 3. Copy .env.example if no .env exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — review it before starting."
fi

# 4. Build and start
docker compose up --build -d

echo ""
echo "=== Install complete ==="
echo "App running at http://localhost"
echo "  Controller (mobile) : http://localhost/"
echo "  TV / kiosk          : http://localhost/tv"
echo "  Management hub      : http://localhost/manage"
echo ""
echo "Stop:    docker compose down"
echo "Restart: docker compose up -d"
