#!/usr/bin/env bash
# DartsLeague Pi install script
# Run as root: sudo bash install.sh
set -euo pipefail

APP_DIR=/home/pi/dartsleague
DB_DIR=/var/lib/dartsleague
NODE_VER=20

echo "=== DartsLeague Install ==="

# 1. Node.js 20
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_VER" ]]; then
  echo "Installing Node.js ${NODE_VER}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VER}.x | bash -
  apt-get install -y nodejs
fi

# 2. System deps
apt-get install -y avahi-daemon chromium-browser cage

# 3. DB directory
mkdir -p "$DB_DIR"
chown pi:pi "$DB_DIR"

# 4. App directory
mkdir -p "$APP_DIR"
chown pi:pi "$APP_DIR"

# 5. Copy repo (assume run from repo root)
rsync -a --exclude='.git' --exclude='node_modules' . "$APP_DIR/"
chown -R pi:pi "$APP_DIR"

# 6. Install server deps
cd "$APP_DIR/server"
sudo -u pi npm install --production

# 7. Build web apps
cd "$APP_DIR"
sudo -u pi npm install -w web/controller -w web/tv
sudo -u pi npm run build

# 8. systemd services
cp ops/systemd/dartsleague-backend.service /etc/systemd/system/
cp ops/systemd/dartsleague-kiosk.service   /etc/systemd/system/
cp ops/systemd/dartsleague-backup.timer    /etc/systemd/system/

systemctl daemon-reload
systemctl enable dartsleague-backend dartsleague-kiosk dartsleague-backup.timer

# 9. avahi mDNS hostname
hostnamectl set-hostname dartsleague
sed -i 's/^#host-name=.*/host-name=dartsleague/' /etc/avahi/avahi-daemon.conf
systemctl restart avahi-daemon

# 10. Start services
systemctl start dartsleague-backend
systemctl start dartsleague-backup.timer

echo ""
echo "=== Install complete ==="
echo "Reboot to launch kiosk: sudo reboot"
echo "Access on LAN: http://dartsleague.local"
