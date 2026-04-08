# DartsLeague - App Analysis and Working Context

## What This App Is

DartsLeague is a self-hosted darts scoring system with three main parts:

- `server/`: Fastify + Socket.IO + SQLite backend
- `web/controller/`: mobile-first Svelte controller used to create matches and enter darts
- `web/tv/`: Svelte TV/kiosk display for lobby stats, live scoring, and celebrations

The server is the source of truth. Both frontend clients are thin renderers that fetch snapshots and subscribe to live updates over Socket.IO.

## Current Runtime Model

The implementation today is:

- one Node.js server process
- SQLite database on local disk
- Socket.IO namespace at `/live`
- static frontend assets served by Fastify from `server/public`

Important route behavior from the current code:

- controller is served at `/`
- TV UI is served at `/tv`
- API is served under `/api/*`
- health check is `GET /health`

## Repo Map

```text
server/
  src/index.js                Fastify bootstrap, static serving, Socket.IO attach
  src/db/connection.js        SQLite open/bootstrap, WAL mode, simple migration
  src/db/schema.sql           base schema and SQL views
  src/engine/x01.js           pure X01 scoring engine
  src/engine/checkouts.js     checkout suggestions
  src/routes/players.js       player CRUD + lifetime stats endpoint
  src/routes/matches.js       match lifecycle, darts, undo, exit
  src/routes/stats.js         leaderboard, match stats, lobby stats
  src/realtime/events.js      shared event names
  src/realtime/room.js        `/live` socket handlers
  src/stats/aggregate.js      SQL-heavy stats aggregation

web/controller/
  src/App.svelte              controller app shell and websocket wiring
  src/stores/match.js         shared controller stores
  src/screens/Home.svelte
  src/screens/NewMatch.svelte
  src/screens/ScoreEntry.svelte
  src/screens/Players.svelte
  src/screens/MatchSummary.svelte

web/tv/
  src/App.svelte              TV app shell and websocket wiring
  src/screens/Lobby.svelte    rotating stats/lobby screen
  src/screens/Match.svelte    live match layout
  src/screens/Celebration.svelte
  src/dartboard/Dartboard.svelte

web/shared/ws-client.js       shared Socket.IO client wrapper
Dockerfile                    production image build
docker-compose.yml            production compose
docker-compose.dev.yml        dev compose, currently references missing Dockerfile.dev
ops/                          install, backup, and systemd units
```

## Backend Flow

### Server bootstrap

`server/src/index.js` does the following:

1. loads env via `dotenv/config`
2. opens SQLite with `openDb()`
3. creates Fastify with pretty logs outside production
4. enables CORS for all origins
5. serves static assets from `server/public`
6. registers players, matches, and stats routes
7. attaches Socket.IO to the Fastify HTTP server

Defaults:

- `PORT=80`
- `HOST=0.0.0.0`
- `DB_PATH=./dartsleague.db` unless overridden

### Database

SQLite is opened through `better-sqlite3` in [server/src/db/connection.js](/Users/mariusandrita/Dockers/DartsLeague/server/src/db/connection.js).

Runtime DB behavior:

- `journal_mode = WAL`
- `foreign_keys = ON`
- `synchronous = NORMAL`
- schema bootstrapped from [server/src/db/schema.sql](/Users/mariusandrita/Dockers/DartsLeague/server/src/db/schema.sql)
- one idempotent migration adds `players.photo`

Core tables:

- `players`
- `matches`
- `match_players`
- `legs`
- `darts`

Core views:

- `v_player_match_avg`
- `v_checkout_pct`

### Match engine

[server/src/engine/x01.js](/Users/mariusandrita/Dockers/DartsLeague/server/src/engine/x01.js) is a pure X01 engine. It owns:

- leg initialization
- dart validation
- bust logic
- checkout handling
- turn advancement
- replay from persisted dart events

Behavior worth remembering:

- `25 x 3` is invalid
- bust on score below zero
- with double-out enabled, finishing on non-double is a bust
- with double-out enabled, leaving `1` is a bust
- third dart auto-ends the turn
- bust also ends the turn immediately

### Match route behavior

[server/src/routes/matches.js](/Users/mariusandrita/Dockers/DartsLeague/server/src/routes/matches.js) is the main orchestration layer. It:

- creates matches
- starts the first leg
- rebuilds current state from stored darts
- persists every dart as an event row
- increments leg wins
- creates next legs automatically
- supports undo of the most recent dart, including reopening a finished leg
- emits Socket.IO events after important state changes

Live match endpoints implemented now:

- `GET /api/matches`
- `POST /api/matches`
- `GET /api/matches/:id`
- `POST /api/matches/:id/start`
- `POST /api/matches/:id/abort`
- `POST /api/matches/:id/darts`
- `POST /api/matches/:id/undo`
- `POST /api/matches/:id/exit`

Note: websocket `turn:skip` exists in [server/src/realtime/room.js](/Users/mariusandrita/Dockers/DartsLeague/server/src/realtime/room.js), but there is no `POST /api/matches/:id/skip` route yet.

## Realtime Contract

Socket.IO namespace: `/live`

Server-to-client events are defined in [server/src/realtime/events.js](/Users/mariusandrita/Dockers/DartsLeague/server/src/realtime/events.js):

- `match:started`
- `match:state`
- `dart:added`
- `turn:ended`
- `leg:won`
- `match:won`
- `celebration`
- `match:paused`

Client-to-server events:

- `join`
- `dart:submit`
- `turn:undo`
- `turn:skip`

Room naming is `match:<id>`.

The shared client wrapper lives in [web/shared/ws-client.js](/Users/mariusandrita/Dockers/DartsLeague/web/shared/ws-client.js) and automatically re-joins a room after reconnect.

## Frontend Analysis

### Controller app

[web/controller/src/App.svelte](/Users/mariusandrita/Dockers/DartsLeague/web/controller/src/App.svelte) manages a simple screen-state app, not a URL router.

Primary screens:

- home
- players
- new match
- score entry
- summary

Key behavior:

- loads players from `/api/players`
- resumes live matches from the home screen
- joins the live match room as role `controller`
- updates local stores from websocket snapshots and turn events

The controller store lives in [web/controller/src/stores/match.js](/Users/mariusandrita/Dockers/DartsLeague/web/controller/src/stores/match.js).

### TV app

[web/tv/src/App.svelte](/Users/mariusandrita/Dockers/DartsLeague/web/tv/src/App.svelte) swaps between:

- lobby when there is no live match
- live match screen during play
- celebration overlays and short dart flash overlays

Key behavior:

- on connect, fetches `GET /api/matches?status=live`
- loads the first live match in the list
- joins that room as role `tv`
- falls back to the lobby when matches end or are paused

### Lobby screen

[web/tv/src/screens/Lobby.svelte](/Users/mariusandrita/Dockers/DartsLeague/web/tv/src/screens/Lobby.svelte) is already richer than a basic idle page.

It:

- fetches `/api/stats/lobby`
- refreshes every 60 seconds
- rotates spotlight scenes every 8 seconds
- shows leaderboard on the left
- cycles through recent results, records, triples leaderboard, 100+ leaderboard, win rates, highlights, and recent 100+ turns
- renders a scrolling ticker at the bottom

### Match screen

[web/tv/src/screens/Match.svelte](/Users/mariusandrita/Dockers/DartsLeague/web/tv/src/screens/Match.svelte) uses a two-column layout:

- left side: current player, remaining score, current darts, last turn, checkout hint, dartboard
- right side: player scoreboard with legs won

It also keeps the most recent dart marker visible briefly after a turn resets.

## Stats Layer

[server/src/stats/aggregate.js](/Users/mariusandrita/Dockers/DartsLeague/server/src/stats/aggregate.js) powers most reporting.

It currently provides:

- lifetime player stats
- per-match stats
- leaderboard by 3-dart average
- lobby data including recent matches, high finish, most 180s, best match average, recent 100+ turns, win rates, streaks, high triples, and 100+ leaderboards

This file is SQL-centric and one of the highest-leverage places for TV/dashboard feature work.

## Commands

Local workspace commands:

```bash
npm install
npm run dev
npm run build
npm run test
```

Workspace script notes from [package.json](/Users/mariusandrita/Dockers/DartsLeague/package.json):

- `npm run dev` starts server + controller Vite + TV Vite concurrently
- `npm run build` builds both frontend apps
- `npm run test` runs server Vitest tests

Server-only commands:

```bash
npm run dev -w server
npm run test -w server
```

## Docker and Deploy Notes

Production container files are present:

- [Dockerfile](/Users/mariusandrita/Dockers/DartsLeague/Dockerfile)
- [docker-compose.yml](/Users/mariusandrita/Dockers/DartsLeague/docker-compose.yml)

Current production image behavior:

- builds both web apps first
- installs production server dependencies
- copies built web assets into `server/public`
- serves DB from `/data/dartsleague.db`
- exposes port `80`

Important gap:

- [docker-compose.dev.yml](/Users/mariusandrita/Dockers/DartsLeague/docker-compose.dev.yml) references `Dockerfile.dev`, but that file does not exist

## Known Mismatches and Gotchas

These are worth keeping in mind before making changes:

- `CLAUDE.md` previously said controller lived at `/controller/`, but the current server serves it at `/`
- `players.photo` is used by routes and stats, but the base schema adds it only through a runtime migration in `connection.js`
- `turn:skip` websocket handling exists, but no matching REST route exists yet
- the TV app loads only the first live match returned by `/api/matches?status=live`
- the root `build` script builds the web apps but does not itself place them into `server/public`; the Dockerfile handles that copy for container builds
- local dev without prebuilt frontend assets may not reflect production static serving unless a separate build/copy step is done

## Best Places To Work Depending On The Task

- match rules, busts, replay bugs: [server/src/engine/x01.js](/Users/mariusandrita/Dockers/DartsLeague/server/src/engine/x01.js)
- match lifecycle, undo, websocket emissions: [server/src/routes/matches.js](/Users/mariusandrita/Dockers/DartsLeague/server/src/routes/matches.js)
- player and lobby stats: [server/src/stats/aggregate.js](/Users/mariusandrita/Dockers/DartsLeague/server/src/stats/aggregate.js)
- socket contract changes: [server/src/realtime/events.js](/Users/mariusandrita/Dockers/DartsLeague/server/src/realtime/events.js) and [server/src/realtime/room.js](/Users/mariusandrita/Dockers/DartsLeague/server/src/realtime/room.js)
- controller UX: `web/controller/src/screens/*`
- TV presentation and motion: `web/tv/src/screens/*`
- DB fields and constraints: [server/src/db/schema.sql](/Users/mariusandrita/Dockers/DartsLeague/server/src/db/schema.sql)

## Suggested Next Checks Before Bigger Changes

- verify how frontend build output is expected to land in `server/public` during local development
- decide whether `skip turn` should be fully implemented or removed
- move the `photo` column into the authoritative SQL schema instead of relying on migration
- decide how multiple simultaneous live matches should be handled on the TV side
