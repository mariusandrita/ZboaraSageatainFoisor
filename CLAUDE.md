# DartsLeague - Current Project Context

## Overview

DartsLeague is a self-hosted darts scoring platform for garage or club play. It is built around one Node.js backend that serves APIs, websocket updates, and static frontend apps.

The project now has four user-facing surfaces:

- `/` - mobile-first controller for match creation and dart entry
- `/tv` - TV/kiosk experience for lobby stats, live matches, celebrations, and match recap
- `/manage` - management hub for badge assets, celebration catalog, experimental celebration ideas, and the proposed tournament structure
- `/api/*` - backend HTTP API used by all clients

## What The App Does Today

### Match flow

- create X01 matches with `301`, `501`, or `701`
- enable `double out`
- play with up to 10 players
- keep selected order or randomize throw order
- rotate leg starters based on darts rules
- generate public match IDs only after a match is actually finished
- exclude aborted matches from the finished-match identity/stats flow
- support undo for the latest dart

### TV experience

- rotating waiting lobby with leaderboards and spotlight player stats
- live match screen with current player focus, last turn darts, live badges, checkout hint, and dartboard highlight
- celebration overlays for scoring, finishes, funny awards, busts, and leg wins
- end-of-match TV recap with averages before/after and badges gained in the match

### Badge and celebration system

- awards are persisted in the backend and aggregated per player
- badge images are now image-backed across controller and TV
- custom badge assets are loaded from `server/public/assets/badges`
- when a custom image is missing, the UI falls back to an auto-generated badge image
- a separate management hub at `/manage` shows which badges have custom artwork and which still use fallback images

### Controller experience

- player management with colors and touch-friendly photo editing
- live score entry with checkout suggestions
- Romanian score reader using browser `speechSynthesis`
- post-match summary with averages, deltas, and badge results

### Tournament planning

There is not yet a full tournament engine in the app, but the project now includes a documented and surfaced proposal in `/manage`:

- recommended format: round robin groups followed by knockout
- proposed minimum data model: tournament, entries, group standings, knockout bracket, match links
- chosen because it can reuse the existing X01 match lifecycle with minimal scoring-engine changes

## Current Architecture

### Backend

`server/` is the source of truth.

- Fastify for HTTP
- Socket.IO namespace at `/live`
- SQLite via `better-sqlite3`
- static assets served from `server/public`

Important backend files:

- `server/src/index.js` - Fastify bootstrap, static serving, route registration, Socket.IO attach
- `server/src/db/connection.js` - database open/bootstrap and runtime migrations
- `server/src/db/schema.sql` - base schema
- `server/src/engine/x01.js` - pure X01 scoring engine
- `server/src/routes/matches.js` - match lifecycle, darts, undo, finish handling, award emission
- `server/src/routes/stats.js` - leaderboard/lobby/match stats endpoints
- `server/src/routes/catalog.js` - management API for badges and celebrations
- `server/src/catalog.js` - centralized badge and celebration catalog definitions
- `server/src/stats/aggregate.js` - SQL-heavy stats aggregation

### Frontends

`web/controller/`

- Svelte app served at `/`
- manages players, match creation, score entry, and match summary

`web/tv/`

- Svelte app served at `/tv`
- swaps between lobby, live match, celebrations, and match recap

`web/manage/`

- Svelte app served at `/manage`
- shows badge asset status, celebration catalog, experimental ideas, and tournament structure proposal

`web/shared/`

- shared websocket client
- shared badge rendering helpers and component

## URLs And Runtime Behavior

### Pages

- `/` - controller
- `/tv` - TV app
- `/manage` - management hub
- `/health` - health endpoint

### API prefixes

- `/api/players`
- `/api/matches`
- `/api/stats`
- `/api/catalog`

### Management API

- `GET /api/catalog/management`

Returns:

- badge asset directory and supported extensions
- badge catalog with custom image status and found files
- active celebration catalog
- experimental celebration ideas

## Realtime Contract

Socket.IO namespace: `/live`

Important server-to-client events:

- `match:started`
- `match:state`
- `dart:added`
- `turn:ended`
- `leg:won`
- `match:won`
- `celebration`
- `match:paused`
- `match:setup`

Important client-to-server events:

- `join`
- `dart:submit`
- `turn:undo`
- `turn:skip`
- `match:setup:update`

The shared client wrapper is in `web/shared/ws-client.js`.

## Badge Assets

Badge artwork lives in:

- `server/public/assets/badges`

Supported formats:

- `.png`
- `.webp`
- `.jpg`
- `.jpeg`
- `.svg`

Asset naming rule:

- use the badge `kind` as the filename, for example `breakfast.png`, `180.webp`, `bullFinish.svg`

Reference and notes are documented in:

- `server/public/assets/badges/README.md`

## Romanian Score Reader

The score reader is implemented in:

- `web/controller/src/screens/ScoreEntry.svelte`

Behavior:

- toggleable from the score entry header
- uses browser `speechSynthesis`
- prefers Romanian voices if available
- remembers enabled state and selected voice in `localStorage`
- announces dart calls, busts, remaining score, and end-of-turn totals when appropriate

Important note:

- this depends on browser voice availability, so different devices may expose different Romanian voices

## Celebration Notes

Implemented celebration and award logic is split between:

- `server/src/engine/x01.js`
- `server/src/routes/matches.js`
- `web/tv/src/screens/Celebration.svelte`
- `server/src/catalog.js`

Important nuance:

- `Robin Hood` is intentionally documented as `manual-only` in the management hub because it cannot be reliably detected from score input alone without physical dart-hit telemetry

## Commands

Root workspace commands:

```bash
npm install
npm run dev
npm run build
npm run test
```

What they do:

- `npm run dev` starts server + controller + TV + manage
- `npm run build` builds controller + TV + manage into `server/public`
- `npm run test` runs server tests

Useful workspace commands:

```bash
npm run dev -w server
npm run dev -w web/controller
npm run dev -w web/tv
npm run dev -w web/manage
npm run test -w server
```

## Docker

Production files:

- `Dockerfile`
- `docker-compose.yml`

Development files:

- `Dockerfile.dev`
- `docker-compose.dev.yml`

Current production Docker behavior:

- installs build dependencies for `better-sqlite3`
- builds controller, TV, and manage frontends
- copies built assets into `server/public`
- serves SQLite from `/data/dartsleague.db`

Current dev compose ports:

- `80`
- `5174`
- `5175`
- `5176`

## Known Constraints And Gaps

- `turn:skip` is wired on the websocket side, but the REST route is still not implemented
- `Robin Hood` cannot be auto-detected with the current score-only input model
- tournament support is currently a documented proposal, not a persisted feature set
- runtime migration logic still exists in `server/src/db/connection.js`; not every schema change is fully expressed only in `schema.sql`
- `npm install` currently reports dependency vulnerabilities from upstream packages; no remediation work has been done yet in this pass

## High-Leverage Areas For Future Work

- `server/src/routes/matches.js` for lifecycle and award behavior
- `server/src/stats/aggregate.js` for leaderboard and lobby stats
- `web/tv/src/screens/*` for presentation work
- `web/controller/src/screens/*` for player and score-entry UX
- `server/src/catalog.js` for badge/celebration metadata
- `web/manage/src/App.svelte` for admin and future tournament management UI
