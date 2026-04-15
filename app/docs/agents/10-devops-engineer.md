# Agent 10 — devops-engineer

**Phase:** 7 — Deploy & polish
**Model routing:** `sonnet`
**Depends on:** 00, 04, 05, 07, 09
**Unblocks:** 11

---

## Objective

Turn the repo into a one-command install on a fresh Pi. systemd runs the show; no manual steps beyond flashing the SD card and running the installer.

## Inputs

- The full repo at the end of Phase 6.
- `docs/HARDWARE.md` §5–7 for config and provisioning conventions.

## Outputs

- [ ] `ops/scripts/install.sh` — idempotent installer. Run on the Pi as `darts`, calls `sudo` where needed. Steps:
  1. Verify prerequisites (Node 20, SQLite, cage, Chromium).
  2. `git clone` or `git pull` the repo into `/opt/dartsleague`.
  3. `npm ci` in `server/`, `web/controller/`, `web/tv/`.
  4. Build the two Svelte bundles into `server/public/`.
  5. Copy systemd unit files from `ops/systemd/` into `/etc/systemd/system/` with ownership preserved.
  6. Create `/var/lib/dartsleague` if missing.
  7. `systemctl daemon-reload`, enable and start backend + kiosk + backup timer.
- [ ] `ops/systemd/dartsleague-backend.service`:
  ```ini
  [Unit]
  Description=DartsLeague backend
  After=network-online.target
  Wants=network-online.target

  [Service]
  Type=simple
  User=darts
  WorkingDirectory=/opt/dartsleague/server
  Environment=NODE_ENV=production PORT=80
  AmbientCapabilities=CAP_NET_BIND_SERVICE
  ExecStart=/usr/bin/node src/index.js
  Restart=on-failure
  RestartSec=2

  [Install]
  WantedBy=multi-user.target
  ```
- [ ] `ops/systemd/dartsleague-kiosk.service`:
  ```ini
  [Unit]
  Description=DartsLeague TV kiosk
  After=dartsleague-backend.service
  Requires=dartsleague-backend.service

  [Service]
  Type=simple
  User=darts
  PAMName=login
  TTYPath=/dev/tty7
  StandardInput=tty-force
  ExecStart=/usr/bin/cage -s -- chromium-browser \
      --kiosk --noerrdialogs --disable-translate --no-first-run \
      --fast --fast-start --disable-features=TranslateUI \
      --disk-cache-dir=/tmp/chromium-cache \
      http://localhost/tv
  Restart=always
  RestartSec=3

  [Install]
  WantedBy=multi-user.target
  ```
- [ ] `ops/systemd/dartsleague-backup.service` + `.timer` — daily SQLite `VACUUM INTO` snapshot, 14-day rotation.
- [ ] `ops/scripts/update.sh` — `git pull`, rebuild, restart backend + kiosk. Zero-downtime is not a goal.
- [ ] `ops/scripts/backup.sh` — called by the timer.
- [ ] `README.md` at repo root with:
  - Hardware BOM summary.
  - One-command install.
  - How to update.
  - How to back up and restore.
  - How to develop on a laptop without a Pi.

## Task checklist

1. Author each script and unit file.
2. Test on a throwaway Pi (or a Pi image in `qemu-system-aarch64`) from scratch.
3. Measure cold-boot time: power on → TV shows home. Tune if > 60 s (likely tweak `systemd-networkd-wait-online` timeout).
4. Verify backend restart does not interrupt an in-progress leg longer than ~3 s.
5. Verify backup script produces a restorable DB.

## Acceptance criteria

- Fresh Pi + install script + reboot → working TV display in under 15 minutes of human time, under 60 s of boot time.
- `systemctl status dartsleague-*` all green.
- A full reboot mid-leg returns to the same leg within 60 s.

## Handoff

Hands off to `qa-tester` for final sign-off.
