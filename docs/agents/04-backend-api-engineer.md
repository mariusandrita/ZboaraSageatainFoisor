# Agent 04 — backend-api-engineer

**Phase:** 2 — Backend core
**Model routing:** `sonnet`
**Depends on:** 02-database-engineer, 03-game-engine-engineer
**Unblocks:** 05, 07, 08

---

## Objective

Wire the DB repos and the game engine together behind Fastify HTTP routes and Socket.IO events. This is the server that phone and TV clients will talk to from Phase 3 onwards.

## Inputs

- `docs/ARCHITECTURE.md` §5 (REST) and §6 (WS).
- Repos from Phase 2 (`database-engineer`).
- Engine from Phase 2 (`game-engine-engineer`).

## Outputs

- [ ] `server/src/index.js` — Fastify bootstrap, Socket.IO attach, static file serving for `/tv` and `/`, graceful shutdown.
- [ ] `server/src/routes/players.js` — `GET/POST/PATCH/DELETE /api/players` with Fastify schema validation.
- [ ] `server/src/routes/matches.js` — full match lifecycle: create, start, submit dart, undo, abort, fetch.
- [ ] `server/src/routes/stats.js` — stubs for Phase 6.
- [ ] `server/src/realtime/room.js` — per-match room orchestration. Holds the live `LegState` in memory, persists every dart to SQLite synchronously, broadcasts to the room.
- [ ] `server/src/realtime/events.js` — event name constants (already created in Phase 1, extend here).
- [ ] Fastify schema validation for every route (Ajv via Fastify built-in).
- [ ] Smoke tests with `undici` hitting the live server on a random port.

## Task checklist

1. Bootstrap Fastify, register `@fastify/socket.io` (or plain `socket.io` attached to `server.server`).
2. Register `@fastify/static` for the built Svelte bundles under `server/public/`.
3. Implement player routes backed by `db/repos/players.js`.
4. Implement match create/start. `POST /api/matches/:id/start` builds the first leg via `engine.newLeg` and stashes the state in `realtime/room.js`.
5. Implement `POST /api/matches/:id/darts`. Flow:
   1. Load room state for the match.
   2. Call `engine.submitDart(state, dart)`.
   3. Persist the dart via `repos/darts.append`.
   4. If turn ended, update the in-memory turn pointer.
   5. If leg won, call `repos/legs.close` and start the next leg (or end the match).
   6. Emit `dart:added` → `turn:ended`? → `leg:won`? → `match:won`? → `celebration`?
6. Implement `POST /api/matches/:id/undo` symmetrically via `engine.undoDart` + `repos/darts.popLast`.
7. Implement WS `join` handler with role-based gating (only `controller` role can emit `dart:submit`, `turn:undo`, `turn:skip`).
8. Crash recovery on boot: find any matches with `status='live'`, reconstruct their room state from the persisted darts.
9. Smoke tests: create players → create match → start → play a full 301 leg via WS → assert `match:state` shows a winner.

## Acceptance criteria

- A curl-scripted match of 301 double-out finishes correctly and writes the expected rows to SQLite.
- Killing and restarting the Node process mid-match resumes the leg with the same state.
- Submitting a dart from a non-controller socket is rejected.
- Fastify schema validation rejects malformed bodies with a structured error.
- Memory: backend idle RSS < 80 MB on the Pi.

## Handoff

Hands off to `phone-controller-engineer` and `tv-display-engineer` simultaneously. They consume the API + WS contract.
