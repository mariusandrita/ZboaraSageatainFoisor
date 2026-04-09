# DartsLeague

Self-hosted darts scoring for controller, TV, and lightweight management.

## What It Is

DartsLeague is a local-first darts app built for real-world play sessions. One backend coordinates match state, stats, celebrations, and assets, while separate frontends handle live scoring, TV display, and management tasks.

Available surfaces:

- `/` - controller for creating matches and entering darts
- `/tv` - TV/kiosk display for lobby stats, live matches, celebrations, and recap
- `/manage` - management hub for badges, celebrations, and tournament planning

## Features

- X01 matches with `301`, `501`, or `701`
- optional `double out`
- up to 10 players
- selected or random throw order
- automatic leg rotation rules
- undo last dart
- public match ID generated only after successful finish
- live websocket sync between controller and TV
- rotating TV lobby with leaderboards and player spotlight stats
- celebration overlays and funny awards
- image-backed badges with fallback-generated artwork
- Romanian score reader in the controller
- management view for badge assets and celebration catalog
- documented tournament structure proposal

## Tech Stack

- Node.js 20
- Fastify
- Socket.IO
- SQLite with `better-sqlite3`
- Svelte + Vite

## Repo Structure

```text
server/
  src/
    index.js
    catalog.js
    db/
    engine/
    realtime/
    routes/
    stats/
  public/

web/
  controller/
  tv/
  manage/
  shared/

Dockerfile
Dockerfile.dev
docker-compose.yml
docker-compose.dev.yml
```

## Local Development

Install dependencies:

```bash
npm install
```

Start everything:

```bash
npm run dev
```

This starts:

- backend server
- controller Vite app
- TV Vite app
- management Vite app

Default local URLs:

- controller: [http://localhost:5174](http://localhost:5174)
- TV: [http://localhost:5175](http://localhost:5175)
- manage: [http://localhost:5176](http://localhost:5176)
- API/server: [http://localhost:80](http://localhost:80)

Useful single-workspace commands:

```bash
npm run dev -w server
npm run dev -w web/controller
npm run dev -w web/tv
npm run dev -w web/manage
npm run test -w server
```

## Build

Build all frontend apps:

```bash
npm run build
```

The built assets are emitted into `server/public`.

## Test

Run backend tests:

```bash
npm run test
```

Current automated test coverage is centered on the X01 scoring engine.

## Badge Assets

Custom badge images go in:

`server/public/assets/badges`

Supported extensions:

- `.png`
- `.webp`
- `.jpg`
- `.jpeg`
- `.svg`

Use the badge kind as the filename, for example:

- `breakfast.png`
- `180.webp`
- `bullFinish.svg`

If a badge image is missing, the UI falls back to a generated placeholder image automatically.

## Main Routes

Pages:

- `/`
- `/tv`
- `/manage`
- `/health`

API:

- `/api/players`
- `/api/matches`
- `/api/stats`
- `/api/catalog`

Management API:

- `GET /api/catalog/management`

## Docker

Production:

```bash
docker compose up --build
```

Development:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Production stores the SQLite database in a Docker volume mounted at `/data`.

## Notes And Constraints

- `turn:skip` exists on the websocket side, but there is not yet a matching REST route
- `Robin Hood` is documented as a manual-only celebration idea because it cannot be detected reliably from score input alone
- tournament support is currently a documented design direction, not a finished feature module
- Romanian score reader depends on browser support for `speechSynthesis` and available Romanian voices

## Push Checklist

- run `npm install`
- run `npm run build`
- run `npm run test`
- verify `/`, `/tv`, and `/manage`
- verify badge assets under `server/public/assets/badges`

## License

No license file is currently included in the repository.
