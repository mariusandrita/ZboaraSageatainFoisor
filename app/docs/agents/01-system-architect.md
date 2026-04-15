# Agent 01 — system-architect

**Phase:** 1 — Architecture
**Model routing:** `opus`
**Depends on:** 00-pi-provisioner
**Unblocks:** 02, 03, 04, 05, 06, 07

---

## Objective

Lock the tech stack, data model, REST + WS contract, and repo layout. After this phase, the contracts in `docs/ARCHITECTURE.md` are **frozen** and downstream agents can build in parallel against them.

## Inputs

- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) — draft to refine and ratify.
- [PLAN.md](../../PLAN.md) — scope and non-functionals.
- Hardware constraints from [docs/HARDWARE.md](../HARDWARE.md).

## Outputs

- [ ] Ratified `docs/ARCHITECTURE.md` with every open decision resolved.
- [ ] `server/src/engine/types.js` — JSDoc typedefs for `Match`, `Leg`, `Turn`, `Dart`, `DartInput`, `TurnState`, `MatchFull`, `PlayerStats`.
- [ ] `web/shared/types.d.ts` — TypeScript-compatible types shared by both Svelte apps.
- [ ] `server/src/db/schema.sql` — final DDL, ready to be executed at startup.
- [ ] `server/src/realtime/events.js` — constant strings for every WS event name.
- [ ] Empty scaffolding for `server/` and `web/controller/` and `web/tv/` (so downstream agents each get a clean landing zone).
- [ ] ADR-0001 through ADR-0005 in `docs/adr/` documenting: stack choice, event-sourced darts, double-out handling, WS room strategy, kiosk strategy.

## Task checklist

1. Walk through every section of `ARCHITECTURE.md`, verify feasibility on Pi 4B 2GB.
2. Bench Fastify + Socket.IO + better-sqlite3 locally on a Pi if available, otherwise a Docker pi image, to sanity-check memory footprint.
3. Finalize the darts `segment`/`multiplier` encoding. Confirm bull representation (25×1=25, 25×2=50, 25×3 illegal).
4. Write ADRs for each decision above.
5. Scaffold the repo (empty files + package.json with pinned versions).
6. Commit. Tag `arch-frozen-v1`.

## Acceptance criteria

- A downstream engineer can read `ARCHITECTURE.md` + the scaffolding and start coding without asking a single clarifying question about shape/flow.
- Schema runs cleanly on SQLite 3.40+.
- Type files are consumable by both Node and Svelte.

## Handoff

Hands off to `database-engineer`, `game-engine-engineer`, `backend-api-engineer` (can run in parallel inside Phase 2).
