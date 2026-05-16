# Hardware Specification & Configuration

Owned by: `pi-provisioner` agent (Phase 0).
Purpose: exact, unambiguous build sheet + provisioning recipe for the garage rig.

---

## 1. Bill of materials

| Part | Model (recommended) | Why | Approx |
|---|---|---|---|
| SBC | **Raspberry Pi 4 Model B — 4 GB** | 2 GB works, 4 GB is the sweet spot for Chromium + Node + SQLite. 8 GB is overkill. | ~€60 |
| PSU | **Official Raspberry Pi 15.3W USB-C (5.1V/3A)** | Non-official PSUs cause undervoltage warnings and random Chromium crashes. | ~€10 |
| SD card | **SanDisk Extreme 32 GB A2 U3** or **Samsung Evo Plus 32 GB** | A2 rating = fast random I/O = snappy SQLite. | ~€10 |
| Case | **Argon ONE V2** or **Argon NEO** | Passive + active cooling, full aluminium, built for long-run headless use. | ~€25 |
| Cable | **Micro-HDMI → HDMI 2.0, 2 m** | Pi 4 uses micro-HDMI. Use port **HDMI0** (closest to the USB-C power port). | ~€8 |
| Network | **Cat6 ethernet patch cable, length to suit** | Gigabit, rock solid. Wi-Fi is a fallback only. | ~€5 |
| Optional | **USB 3.0 → 2.5" SATA SSD 120 GB** + USB-to-SATA adapter | Boot from SSD for longevity if the garage stays online 24/7. | ~€25 |
| Optional | **Small USB keyboard** | Only used for first boot / recovery. Not required in normal operation. | — |

Total: ~€120 for SD boot, ~€145 with SSD.

---

## 2. Display & input

- **TV**: any HDMI TV with a free HDMI port. Target **1920×1080 @ 60 Hz**. 4K works but wastes GPU on a 2 GB Pi — leave it at 1080p unless you have the 4 GB model and want 4K.
- **HDMI port**: use **HDMI0** on the Pi (the one closest to the USB-C power input).
- **No touchscreen, no mouse** on the TV side. The phone is the only controller.
- **Phone**: any reasonably modern Android or iOS phone with a browser that supports WebSockets and CSS grid. No app install. It will open `http://dartsleague.local/` on the garage LAN.

---

## 3. Network

- **Ethernet only** from the Pi to the garage switch/router. Wi-Fi is fragile in a metal garage — keep it as a backup.
- Pi gets a **DHCP reservation** on the router (by MAC) so the IP is stable.
- The phone joins the same LAN (Wi-Fi is fine for the phone).
- mDNS (`avahi-daemon`) is enabled on the Pi so `http://dartsleague.local` resolves without typing an IP. On Android some browsers don't resolve `.local` — the Pi also exposes its reserved IP and prints a QR code on the TV home screen.

---

## 4. Power & environment

- **Official 5.1V / 3A USB-C PSU** — non-negotiable. Cheap chargers trigger undervoltage and Chromium silently dies.
- **UPS (optional but recommended)**: any small consumer UPS if the garage has unstable power. SD cards hate abrupt power loss.
- **Temperature**: the garage gets hot. Target CPU temp < 70 °C. The Argon ONE case + its active fan handles this. Add `over_voltage=0` (default) — do not overclock.
- Do not put the Pi on the floor. Sawdust in a fan is a dead fan.

---

## 5. Operating system

- **Raspberry Pi OS (64-bit), Bookworm, Lite** (no desktop).
- Install with **Raspberry Pi Imager**:
  - Hostname: `dartsleague`
  - Username: `darts`
  - Password: something long, saved to your password manager.
  - Wi-Fi: *skipped* (ethernet only).
  - SSH: **enabled**.
  - Locale & keyboard: to taste.
- After first boot:
  ```bash
  sudo apt update && sudo apt full-upgrade -y
  sudo apt install -y \
      git curl ca-certificates \
      cage chromium-browser \
      avahi-daemon \
      sqlite3 \
      unclutter
  ```

### Kiosk strategy

The Pi runs **headless + cage** (a minimal Wayland kiosk compositor) with Chromium in `--kiosk` mode. This is lighter than a full desktop.

1. Enable the kiosk user service (see `/10-devops-engineer.md`):
   ```bash
   sudo systemctl enable dartsleague-backend.service
   sudo systemctl enable dartsleague-kiosk.service
   ```
2. `dartsleague-backend.service` starts Node on port `80` (via cap) or `8080` + iptables redirect.
3. `dartsleague-kiosk.service` starts `cage -s -- chromium-browser --kiosk --noerrdialogs --disable-translate --no-first-run --fast --fast-start --disable-features=TranslateUI --disk-cache-dir=/tmp/chromium-cache http://localhost/tv`

### Node.js runtime

- **Node.js 20 LTS** via NodeSource or `nvm` under the `darts` user.
- PM manager: **systemd** (not `pm2`, keep it native).

### GPU / memory split

In `/boot/firmware/config.txt`:

```ini
# Force 1080p on any HDMI handshake
hdmi_group=1
hdmi_mode=16
hdmi_drive=2
disable_overscan=1

# Give Chromium enough GPU memory
gpu_mem=256

# Disable rainbow splash for faster boot
disable_splash=1
```

In `/boot/firmware/cmdline.txt` append (space-separated, same line):
```
quiet loglevel=3 vt.global_cursor_default=0 logo.nologo
```

---

## 6. Filesystem layout

```
/opt/dartsleague/           # app code (owned by darts:darts)
  ├── server/               # node backend
  ├── web/                  # built svelte bundles (tv + controller)
  └── package.json

/var/lib/dartsleague/       # mutable data (owned by darts:darts)
  ├── darts.sqlite          # primary DB
  ├── darts.sqlite-wal
  └── backups/              # rotated backups, daily

/etc/systemd/system/dartsleague-backend.service
/etc/systemd/system/dartsleague-kiosk.service
/etc/systemd/system/dartsleague-backup.timer
/etc/systemd/system/dartsleague-backup.service
```

SQLite uses **WAL** mode for crash safety. A daily `VACUUM INTO` dumps a consistent copy to `/var/lib/dartsleague/backups/darts-YYYY-MM-DD.sqlite` and keeps the last 14.

---

## 7. Provisioning checklist (Phase 0 exit criteria)

The `pi-provisioner` agent must be able to tick every box below:

- [ ] Pi boots from fresh SD card.
- [ ] `ssh darts@dartsleague.local` works from the laptop.
- [ ] `ping dartsleague.local` resolves from phone.
- [ ] `vcgencmd measure_temp` reports < 60 °C at idle.
- [ ] `vcgencmd get_throttled` returns `0x0`.
- [ ] Node 20 installed: `node -v` → `v20.x`.
- [ ] `/opt/dartsleague` and `/var/lib/dartsleague` exist with correct ownership.
- [ ] A placeholder `index.html` served by a dummy Node process on `:80` loads on the phone at `http://dartsleague.local`.
- [ ] `dartsleague-kiosk.service` auto-starts Chromium pointing at the placeholder page on reboot.
- [ ] Hard power cycle → system returns to the placeholder page within 60 s.
