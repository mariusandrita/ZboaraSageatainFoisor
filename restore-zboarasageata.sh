#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_USER="${APP_USER:-kenny}"
APP_HOME="${APP_HOME:-/home/${APP_USER}}"
APP_DIR="${APP_DIR:-${APP_HOME}/ZboaraSageata}"
SYSTEMD_DIR="/etc/systemd/system"

if [[ ${EUID} -ne 0 ]]; then
  exec sudo APP_USER="${APP_USER}" APP_HOME="${APP_HOME}" APP_DIR="${APP_DIR}" bash "$0" "$@"
fi

mkdir -p "${APP_DIR}"
cp -a "${BACKUP_DIR}/app/." "${APP_DIR}/"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

install -m 0644 "${BACKUP_DIR}/services/zboarasageata.service" "${SYSTEMD_DIR}/zboarasageata.service"

if [[ -f "${BACKUP_DIR}/services/dartsleague-kiosk.service" ]]; then
  install -m 0644 "${BACKUP_DIR}/services/dartsleague-kiosk.service" "${SYSTEMD_DIR}/dartsleague-kiosk.service"
fi

if [[ -f "${BACKUP_DIR}/home-files/.xinitrc" ]]; then
  install -o "${APP_USER}" -g "${APP_USER}" -m 0755 "${BACKUP_DIR}/home-files/.xinitrc" "${APP_HOME}/.xinitrc"
fi

if [[ -f "${BACKUP_DIR}/home-files/getty-override.conf" ]]; then
  mkdir -p /etc/systemd/system/getty@tty1.service.d
  install -m 0644 "${BACKUP_DIR}/home-files/getty-override.conf" /etc/systemd/system/getty@tty1.service.d/override.conf
fi

systemctl daemon-reload
systemctl enable zboarasageata.service
systemctl restart zboarasageata.service

if [[ -f "${SYSTEMD_DIR}/dartsleague-kiosk.service" ]]; then
  systemctl enable dartsleague-kiosk.service
  systemctl restart dartsleague-kiosk.service || true
fi

printf 'Restored application to %s and started configured services.\n' "${APP_DIR}"
