# Architecture

Owned by: `system-architect` agent (Phase 1). Frozen at end of Phase 1 — downstream phases build against this contract.

---

## 1. Goals

1. **Single process, single box.** The Pi runs one Node.js process. No containers, no cloud, no extra services beyond `avahi-daemon` for mDNS.
2. **Deterministic game engine.** The X01 rules engine is pure, unit-testable, and the only place that mutates match state.
3. **Event-sourced matches.** Every dart is an append-only event. Scores and stats are derived. A match can be rebuilt from its events.
4. **Phone and TV are dumb clients.** All state lives on the server. Clients subscribe and render.
5. **Crash-safe.** Pull the plug mid-leg → after reboot the same leg resumes.

---

## 2. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | **Node.js 20 LTS** | Mature, low-memory, first-class on Pi. |
| HTTP | **Fastify 4** | Fast, small, great schema validation. |
| WebSocket | **Socket.IO 4** | Built-in reconnect, rooms, fallback, debug tools. |
| DB | **SQLite 3** via **better-sqlite3** | Synchronous API, rock-solid, zero config, WAL mode. |
| Frontend | **Svelte 4 + Vite** | Tiny bundles (~15 KB runtime), perfect for Pi-hosted Chromium and phone browsers. |
| Styling | **Plain CSS + CSS custom properties** | No Tailwind build weight. |
| SVG | Hand-authored / converted from `view-dartboard.jpg` | See Phase 4. |
| Process mgr | **systemd** | Already on Pi, no extra deps. |
| Tests | **Vitest** (engine) + **Playwright** (smoke) | Vitest runs fast on Pi; Playwright runs on dev laptop. |
| Lint / fmt | **Biome** | Single binary, faster than ESLint+Prettier. |

Total runtime on Pi: ~80 MB Node + ~200 MB Chromium. Fits comfortably in 2 GB; very comfortable in 4 GB.

---

## 3. Repo layout

```
DartsLeague/
├── PLAN.md
├── docs/
│   ├── HARDWARE.md
│   ├── ARCHITECTURE.md
│   └── agents/
│       └── *.md
├── server/
│   ├── src/
│   │   ├── index.js                 # fastify + socket.io bootstrap
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   ├── migrations/
│   │   │   └── connection.js
│   │   ├── engine/
│   │   │   ├── x01.js               # pure game engine
│   │   │   ├── x01.test.js
│   │   │   ├── checkouts.js         # checkout suggestion tables
│   │   │   └── types.js
│   │   ├── routes/
│   │   │   ├── players.js
│   │   │   ├── matches.js
│   │   │   └── stats.js
│   │   ├── realtime/
│   │   │   ├── events.js            # WS event catalog
│   │   │   └── room.js              # per-match room
│   │   └── stats/
│   │       └── aggregate.js
│   └── package.json
├── web/
│   ├── controller/                  # phone UI (svelte)
│   │   ├── src/
│   │   │   ├── App.svelte
│   │   │   ├── screens/
│   │   │   │   ├── Home.svelte
│   │   │   │   ├── NewMatch.svelte
│   │   │   │   ├── ScoreEntry.svelte
│   │   │   │   └── Players.svelte
│   │   │   └── stores/
│   │   │       └── match.js
│   │   └── vite.config.js
│   ├── tv/                          # TV kiosk UI (svelte)
│   │   ├── src/
│   │   │   ├── App.svelte
│   │   │   ├── screens/
│   │   │   │   ├── Home.svelte
│   │   │   │   ├── Match.svelte
│   │   │   │   └── Celebration.svelte
│   │   │   └── dartboard/
│   │   │       ├── Dartboard.svelte
│   │   │       ├── dartboard.svg
│   │   │       └── segments.js
│   │   └── vite.config.js
│   └── shared/
│       ├── ws-client.js
│       └── types.d.ts
└── ops/
    ├── systemd/
    │   ├── dartsleague-backend.service
    │   ├── dartsleague-kiosk.service
    │   └── dartsleague-backup.timer
    └── scripts/
        ├── install.sh
        └── backup.sh
```

Both Svelte apps build to `server/public/tv/` and `server/public/controller/`. Fastify serves them as static files. One Node process serves everything.

---

## 4. Data model (SQLite)

```sql
-- players ---------------------------------------------------------------
CREATE TABLE players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  nickname      TEXT,
  color         TEXT NOT NULL DEFAULT '#e63946', -- hex, shown on TV cards
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at   TEXT
);

-- matches ---------------------------------------------------------------
-- One "match" = a best-of-N sequence of legs between a fixed set of players.
CREATE TABLE matches (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mode            TEXT NOT NULL CHECK (mode IN ('x01')),
  starting_score  INTEGER NOT NULL CHECK (starting_score IN (301, 501, 701)),
  double_out      INTEGER NOT NULL DEFAULT 1,  -- boolean
  legs_to_win     INTEGER NOT NULL DEFAULT 1,  -- Bo1 = 1, Bo3 = 2, Bo5 = 3, Bo7 = 4
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  started_at      TEXT,
  ended_at        TEXT,
  winner_id       INTEGER REFERENCES players(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','live','finished','aborted'))
);

CREATE TABLE match_players (
  match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players(id),
  position   INTEGER NOT NULL,                    -- throw order, 0-based
  legs_won   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, player_id)
);

-- legs ------------------------------------------------------------------
CREATE TABLE legs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id      INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  leg_number    INTEGER NOT NULL,
  starting_id   INTEGER NOT NULL REFERENCES players(id),  -- who threw first
  winner_id     INTEGER REFERENCES players(id),
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at      TEXT,
  UNIQUE (match_id, leg_number)
);

-- event-sourced darts: the single source of truth --------------------------
-- Everything else (turn score, remaining, bust, checkout, stats) is derived.
CREATE TABLE darts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  leg_id       INTEGER NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  player_id    INTEGER NOT NULL REFERENCES players(id),
  turn_number  INTEGER NOT NULL,    -- 1-based turn within the leg for this player
  dart_in_turn INTEGER NOT NULL CHECK (dart_in_turn BETWEEN 1 AND 3),
  segment      INTEGER NOT NULL CHECK (segment IN (0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,25)),
  multiplier   INTEGER NOT NULL CHECK (multiplier IN (1,2,3)),  -- 25x1=25, 25x2=50 (bull), 25x3 invalid
  score_value  INTEGER NOT NULL,    -- segment * multiplier (precomputed, but verified)
  busted       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Guard: bull can only be 25 or 50
-- enforced in engine, not in SQL (CHECK constraints can't easily express it cleanly)
CREATE INDEX idx_darts_leg ON darts(leg_id, turn_number, dart_in_turn);
```

### Derived views (created as SQL views)

```sql
-- 3-dart average per player per match
CREATE VIEW v_player_match_avg AS
SELECT
  l.match_id,
  d.player_id,
  ROUND(AVG(turn_total) * 1.0, 2) AS avg_3dart
FROM (
  SELECT leg_id, player_id, turn_number, SUM(score_value) AS turn_total
  FROM darts
  GROUP BY leg_id, player_id, turn_number
) t
JOIN darts d ON d.leg_id = t.leg_id AND d.player_id = t.player_id AND d.turn_number = t.turn_number
JOIN legs l ON l.id = d.leg_id
GROUP BY l.match_id, d.player_id;
```

More views live in `server/src/stats/aggregate.js` (Phase 6).

---

## 5. REST API

Prefix: `/api`. JSON in/out. All error responses: `{ "error": { "code": "...", "message": "..." } }`.

### Players

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/players` | — | `Player[]` |
| POST | `/players` | `{name, nickname?, color?}` | `Player` |
| PATCH | `/players/:id` | partial | `Player` |
| DELETE | `/players/:id` | — | `204` (soft delete via `archived_at`) |
| GET | `/players/:id/stats` | — | `PlayerStats` |

### Matches

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/matches?status=live\|finished` | — | `Match[]` |
| POST | `/matches` | `{starting_score, double_out, legs_to_win, player_ids[]}` | `Match` (status=pending) |
| POST | `/matches/:id/start` | — | `Match` (status=live, first leg created) |
| POST | `/matches/:id/abort` | — | `Match` (status=aborted) |
| GET | `/matches/:id` | — | `MatchFull` (match + players + legs + current turn state) |
| POST | `/matches/:id/darts` | `{segment, multiplier}` | `TurnState` |
| POST | `/matches/:id/undo` | — | `TurnState` — pops the last dart |

### Stats

| Method | Path | Returns |
|---|---|---|
| GET | `/stats/leaderboard` | top players by avg, 180s, checkout % |
| GET | `/stats/matches/:id` | per-match aggregated stats |

---

## 6. WebSocket contract

Transport: Socket.IO, namespace `/live`. One room per active match: `match:<id>`.

### Server → client events

| Event | Payload | Sent when |
|---|---|---|
| `match:state` | full `MatchFull` snapshot | On join, on refresh, after undo |
| `dart:added` | `{dart, turnState}` | Every dart |
| `turn:ended` | `{turnState, nextPlayerId}` | After 3rd dart or bust |
| `leg:won` | `{legId, winnerId, matchState}` | On checkout |
| `match:won` | `{matchId, winnerId}` | On last leg of a Bo-N |
| `celebration` | `{kind:'180'|'highFinish'|'bullFinish', playerId, value}` | On trigger events |

### Client → server events

| Event | Payload | Notes |
|---|---|---|
| `join` | `{matchId, role:'tv'|'controller'}` | Joins the match room |
| `dart:submit` | `{segment, multiplier}` | Controller only |
| `turn:undo` | — | Controller only, pops last dart |
| `turn:skip` | — | Force-end turn (safety net) |

All server→client events are also persisted; a reconnecting client gets the full state via `match:state`, not a replay of individual events. That keeps the protocol idempotent.

---

## 7. Game engine contract (`engine/x01.js`)

Pure functions, no I/O. The only thing that knows X01 rules.

```js
/**
 * @typedef {{segment:number, multiplier:number}} DartInput
 * @typedef {{
 *   startingScore: 301|501|701,
 *   doubleOut: boolean,
 *   players: number[],        // ids in throw order
 *   leg: {
 *     currentPlayerIdx: number,
 *     remaining: Record<playerId, number>,  // score left per player
 *     turn: DartInput[],                     // current turn, 0..3 darts
 *     turnStartRemaining: number,            // remaining before current turn
 *     finished: boolean,
 *     winnerId: number|null,
 *   }
 * }} LegState
 */

// All functions are pure: (state, input) -> newState
export function newLeg(opts)            {...}
export function submitDart(state, dart) {...}  // handles 3rd-dart end, bust, checkout, double-out
export function undoDart(state)         {...}
export function endTurn(state)          {...}  // explicit end (bust, 3 darts thrown)
export function checkoutSuggestion(remaining, dartsLeft, doubleOut) {...}
```

### X01 rules the engine must encode

- Start at `startingScore`, subtract per dart.
- `remaining` must never go below 0.
- **Bust** conditions (turn ends, remaining reverts to `turnStartRemaining`):
  - Going below 0.
  - Landing exactly on 0 with the last dart **not** a double, when `doubleOut=true`.
  - Landing on 1 when `doubleOut=true` (can't finish on 1 with a double).
- **Checkout**: remaining goes to 0 **and** (if `doubleOut`) the finishing dart is a double (including bull=25×2=50 which counts as a double).
- 180 detection: sum of 3 darts in a turn equals 180.
- Turn length: up to 3 darts, or less if player checks out.
- Only **one** leg active at a time per match.
- Engine returns which celebration event to emit (`180`, `highFinish` ≥ 100 checkout, `bullFinish` bull checkout).

The engine has >30 unit tests covering these rules (Phase 2 responsibility of `game-engine-engineer`).

---

## 8. Frontend contract

Two Svelte apps, same Socket.IO client, one shared types file.

- **Controller** (`/`) — phone-first. Flows: Home → New Match wizard → Score Entry.
- **TV** (`/tv`) — full-screen kiosk. Reactive to WS events only, never initiates state changes. Auto-joins the one active live match (or shows idle screen if none).

Both trust the server completely. The controller shows optimistic UI on `dart:submit` but the canonical score is whatever `match:state` says.

---

## 9. Boot sequence

1. Pi powers on.
2. systemd starts `dartsleague-backend.service` — Fastify on port 80, Socket.IO attached, SQLite opens WAL.
3. systemd starts `dartsleague-kiosk.service` — `cage` launches Chromium in kiosk pointing at `http://localhost/tv`.
4. Chromium loads the TV app, opens a WS, joins the idle room or the in-progress `match:<id>` room.
5. On any phone on the LAN, user opens `http://dartsleague.local/`, the controller app loads.
6. Player 1 runs the New Match wizard on the phone. Match starts. Both clients receive events.

---

## 10. Non-functional targets

| Metric | Target |
|---|---|
| Dart submit → TV reflects | < 200 ms (LAN) |
| Cold boot → TV ready | < 60 s |
| Memory footprint (backend) | < 120 MB RSS |
| DB size after 1 year of weekly play | < 50 MB |
| Bus-factor | entire project should be restorable from repo + fresh SD card in < 30 min |
