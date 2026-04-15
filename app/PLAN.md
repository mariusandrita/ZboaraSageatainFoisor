# DartsLeague — Garage Darts Platform

**Role of this document:** Master plan. Owned by the Project Manager (you + Claude).
**Last updated:** 2026-04-05
**Status:** Planning

---

## 1. Vision

A self-hosted darts scoring system for the garage. One Raspberry Pi 4B drives a wall-mounted TV over HDMI and serves a phone web app that the player on the oche uses to punch in darts. The TV shows live score, current player, dart-by-dart breakdown, and an animated SVG dartboard that zooms to each hit. All matches and player stats are persisted locally.

No cloud, no accounts, no internet dependency. Ethernet only. Everything lives on the Pi.

---

## 2. Scope (v1.0)

### In scope
- Player database: create, edit, delete, stats per player.
- Game modes: **X01** with starting scores **301 / 501 / 701**.
- Match formats: 2, 3, or 5 players (1v1, FFA, and 5-player rounds).
- Best-of legs configurable per match (Bo1, Bo3, Bo5, Bo7).
- **Double-out** toggle (standard pro rule) + **straight-out** option.
- Dart-by-dart entry on phone: segments 1–20, 25 (outer bull), 50 (bullseye), with Single / Double / Triple modifiers.
- Bust detection, checkout suggestions, 180 celebration.
- TV view: scoreboard, current thrower, turn score, remaining, last-3-darts trail, animated SVG dartboard with zoom on last hit.
- Stats: 3-dart average, first-9 average, checkout %, highest finish, 180s, 140+, 100+, legs won.
- Match history browser.
- Full offline operation, LAN only.

### Out of scope (v1.0, may come in v1.1+)
- Cricket, Around-the-Clock, Shanghai, other game modes.
- Camera-based auto scoring.
- User accounts / auth (garage-only, trusted LAN).
- Cloud sync.
- Mobile native apps (browser PWA is enough).

---

## 3. Hardware

Full spec in `docs/HARDWARE.md`. Summary:

| Component | Spec | Notes |
|---|---|---|
| Compute | Raspberry Pi 4B, 4GB (preferred) or 2GB (works) | 4GB gives headroom for Chromium + Node. |
| Storage | 32 GB A1/A2 microSD (SanDisk Extreme or Samsung Evo Plus) | Optional USB SSD for longevity. |
| Power | Official 5V/3A USB-C PSU | Undervoltage kills the Pi — do not cheap out here. |
| Display | Any HDMI TV, 1080p target | Pi supports 4K but 1080p is smoother on 2GB. |
| Cable | Micro-HDMI to HDMI (Pi 4 uses micro-HDMI) | Port HDMI0 (nearest USB-C). |
| Network | Ethernet (Cat5e/Cat6) | Wi-Fi works but ethernet is rock-solid. |
| Cooling | Heatsinks + small fan or Argon case | Chromium + Pi in a hot garage will throttle. |
| Input (setup only) | Any USB keyboard for initial provisioning | Not needed in normal play. |
| Phone | Any modern Android / iOS with a browser | Connects to `http://dartsleague.local` on the LAN. |

---

## 4. Architecture (one-liner)

**Fastify + Socket.IO** on Node.js 20 on the Pi serves:
1. a **TV kiosk page** (`/tv`) loaded by Chromium in kiosk mode on boot,
2. a **controller page** (`/`) opened on the phone browser,
3. a **REST API** for player/match CRUD and history,
4. a **WebSocket channel** that mirrors every dart between controller and TV in real time.

Data lives in **SQLite** via `better-sqlite3`. UI is **Svelte + Vite** (two routes, one bundle). See `docs/ARCHITECTURE.md` for data flow, schema, and API contract.

```
  [Phone browser]  ─ WS ─┐
                         ├──> [Fastify + Socket.IO]  ──> [SQLite]
  [TV Chromium kiosk]─ WS ┘        (Pi 4B on LAN)
```

---

## 5. Phases

Phases run mostly sequentially, with some overlap (Phase 3 and Phase 4 can start once Phase 2 publishes the API/WS contract).

| # | Phase | Goal | Agents | Exit criteria |
|---|---|---|---|---|
| **0** | Infrastructure | Pi OS, network, kiosk auto-start, Node runtime. | `pi-provisioner` | `ssh` works, kiosk Chromium launches on boot and loads a blank page. |
| **1** | Architecture | Lock tech stack, data model, API + WS contract, folder layout. | `system-architect` | `docs/ARCHITECTURE.md` approved. Schema + contract checked into repo. |
| **2** | Backend core | DB, X01 game engine, REST, WebSocket. | `database-engineer`, `game-engine-engineer`, `backend-api-engineer` | All API + WS endpoints respond. Unit tests for game engine pass. |
| **3** | Phone controller | Session setup wizard + dart entry UI. | `phone-controller-engineer` | A full 501 match can be scored from the phone alone (TV not required). |
| **4** | TV display | SVG dartboard + scoreboard + zoom animation. | `svg-dartboard-specialist`, `tv-display-engineer` | TV reflects every dart within 200 ms, zoom lands on correct segment. |
| **5** | Real-time sync | Harden WS: reconnect, late-join, replay-on-refresh. | `realtime-sync-engineer` | TV can be refreshed mid-leg and recovers full state. Phone drop/reconnect does not desync. |
| **6** | Stats & history | Player stats pages, match browser, aggregated views. | `stats-engineer` | Averages, checkout %, 180s all match manual calc on a sample match. |
| **7** | Deploy & QA | systemd services, boot orchestration, full playtest. | `devops-engineer`, `qa-tester` | Cold boot → functional system in < 60s. QA sign-off checklist green. |

---

## 6. Agent roster

All agent briefs live in `docs/agents/`. Each file states the agent's objective, inputs, outputs, task checklist, and acceptance criteria. The PM (this document) is the single source of truth for which agent runs when.

- [00 — pi-provisioner](docs/agents/00-pi-provisioner.md)
- [01 — system-architect](docs/agents/01-system-architect.md)
- [02 — database-engineer](docs/agents/02-database-engineer.md)
- [03 — game-engine-engineer](docs/agents/03-game-engine-engineer.md)
- [04 — backend-api-engineer](docs/agents/04-backend-api-engineer.md)
- [05 — phone-controller-engineer](docs/agents/05-phone-controller-engineer.md)
- [06 — svg-dartboard-specialist](docs/agents/06-svg-dartboard-specialist.md)
- [07 — tv-display-engineer](docs/agents/07-tv-display-engineer.md)
- [08 — realtime-sync-engineer](docs/agents/08-realtime-sync-engineer.md)
- [09 — stats-engineer](docs/agents/09-stats-engineer.md)
- [10 — devops-engineer](docs/agents/10-devops-engineer.md)
- [11 — qa-tester](docs/agents/11-qa-tester.md)

---

## 7. Critical path

```
0 ── 1 ── 2 ──┬── 3 ──┐
              └── 4 ──┴── 5 ── 6 ── 7
```

Phase 2 is the bottleneck. Once the API + WS contract is frozen at the end of Phase 1, Phases 3 and 4 can be built in parallel against a mocked backend and wire up live in Phase 5.

---

## 8. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Chromium on 2GB Pi stutters during zoom animations | TV looks janky | Target 1080p, GPU mem split 256, use CSS transforms only (no SVG filter reflows), profile on-device early in Phase 4. |
| Phone loses Wi-Fi mid-leg | Match stalls | WS auto-reconnect + replay-on-reconnect (Phase 5 owns this). |
| SD card corruption after power loss | Data loss | Enable `PARTUUID` + `ro` rootfs option OR mount `/var/lib/dartsleague` with `sync`, daily SQLite backup to USB stick. |
| Garage humidity / heat | Pi throttling or death | Argon ONE case or similar, keep Pi off the floor, fan always on. |
| Double-out edge cases (bust on non-double, 1 remaining, etc.) | Wrong scores, player rage | Game engine is unit-tested against the full DartConnect/PDC rulebook in Phase 2. |
| Bug found mid-league | Incomplete match | Match state is persisted after every dart — recovery is always possible. |

---

## 9. Definition of done (v1.0)

- [ ] Cold boot of Pi → TV shows DartsLeague home within 60 seconds.
- [ ] Phone connects to `http://dartsleague.local` without extra config.
- [ ] Can add 5 players, play a Bo3 501 double-out match between any 2 of them, TV reflects every dart.
- [ ] Can play a 3-player and 5-player 501 match.
- [ ] Stats page shows correct 3-dart average and checkout % after the match.
- [ ] Pulling the plug and booting again restores the in-progress leg.
- [ ] Full playtest of a real garage night with no manual intervention.
