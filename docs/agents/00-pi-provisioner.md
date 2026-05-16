# Agent 00 — pi-provisioner

**Phase:** 0 — Infrastructure
**Model routing:** `sonnet`
**Depends on:** nothing
**Unblocks:** everything

---

## Objective

Take a Pi 4B out of the box and turn it into a headless, hardened, kiosk-ready appliance that auto-launches Chromium on boot and exposes `http://dartsleague.local` on the garage LAN. No app code yet — just the platform.

## Inputs

- [docs/HARDWARE.md](../HARDWARE.md) — authoritative hardware list and OS config.
- Physical Pi, SD card, PSU, Ethernet cable, TV, dev laptop.
- Router admin access (to set DHCP reservation).

## Outputs / deliverables

- [ ] Flashed SD card with Raspberry Pi OS Lite 64-bit, user `darts`, hostname `dartsleague`, SSH enabled.
- [ ] `/boot/firmware/config.txt` matches the HDMI + GPU mem split in HARDWARE.md.
- [ ] `avahi-daemon` running; `dartsleague.local` resolves from the laptop and phone.
- [ ] Node.js 20 LTS installed system-wide (`/usr/bin/node`).
- [ ] Directories: `/opt/dartsleague` and `/var/lib/dartsleague` with `darts:darts` ownership.
- [ ] `ops/scripts/install.sh` idempotent bootstrap script committed to repo.
- [ ] Placeholder `index.html` served by a dummy Node process on port 80.
- [ ] `dartsleague-backend.service` and `dartsleague-kiosk.service` installed and enabled (even if pointing at placeholders).
- [ ] `cage + chromium --kiosk` launches automatically on boot and displays the placeholder page on the TV.
- [ ] `ops/README.md` documents the provisioning steps, including how to reflash.

## Task checklist

1. Flash SD card via Raspberry Pi Imager with the settings in HARDWARE.md §5.
2. First boot, SSH in, run `sudo apt update && sudo apt full-upgrade -y`.
3. Install packages: `git curl cage chromium-browser avahi-daemon sqlite3 unclutter`.
4. Install Node.js 20 LTS via NodeSource.
5. Create `darts` user directories under `/opt` and `/var/lib`, chown them.
6. Write `config.txt` and `cmdline.txt` tweaks from HARDWARE.md §5.
7. Set a router DHCP reservation for the Pi's MAC.
8. Write a minimal placeholder backend: a Node script that serves `index.html` on :80 via `http.createServer`.
9. Write the two systemd unit files per HARDWARE.md §5.
10. `systemctl enable --now` both services. Reboot. Verify TV shows the placeholder.
11. Capture everything into `ops/scripts/install.sh` so a fresh SD card can be reprovisioned from a laptop in under 15 minutes.

## Acceptance criteria

All boxes in [HARDWARE.md §7 "Provisioning checklist"](../HARDWARE.md#7-provisioning-checklist-phase-0-exit-criteria) must be green.

## Handoff

Hands off to `system-architect` with a working Pi, SSH access, and an empty `/opt/dartsleague` waiting for code.
