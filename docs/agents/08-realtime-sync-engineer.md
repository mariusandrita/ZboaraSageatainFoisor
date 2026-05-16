# Agent 08 — realtime-sync-engineer

**Phase:** 5 — Real-time sync
**Model routing:** `opus`
**Depends on:** 04, 05, 07
**Unblocks:** 11

---

## Objective

Harden the real-time layer so the system survives phone Wi-Fi hiccups, TV refreshes, backend restarts, and mid-leg power cuts without ever desyncing or losing a dart.

## Inputs

- Phases 2–4 deliverables.
- `docs/ARCHITECTURE.md` §6 WS contract.

## Outputs

- [ ] Idempotent `dart:submit`: every submit carries a client-generated `clientDartId` (UUID). Server deduplicates by (`matchId`, `clientDartId`) within a 60 s window.
- [ ] `match:state` snapshot messages include a monotonic `version` counter per match. Clients drop stale messages.
- [ ] Replay-on-reconnect: on Socket.IO `reconnect`, clients re-issue `join` and receive a fresh `match:state`. No event log replay — snapshot only.
- [ ] Controller offline buffer: the phone buffers submits in memory while disconnected and flushes in order on reconnect, with `clientDartId` deduping protecting against double-submits.
- [ ] TV recovery: reloading `/tv` in Chromium re-joins the live match and restores the board, player cards, and last-dart zoom state.
- [ ] Backend recovery (already started in Phase 2): on boot, scan for `status='live'` matches, rebuild in-memory room state from persisted darts, and emit `match:state` to anyone who joins.
- [ ] Heartbeat: server emits `ping` every 10 s; clients show an "offline" pill if 3 consecutive pings are missed.
- [ ] E2E tests with Playwright: happy path, phone reconnect, TV reload, backend restart mid-match.

## Task checklist

1. Add `clientDartId` to the WS `dart:submit` payload and the `darts` table (`client_dart_id TEXT UNIQUE`).
2. Add the `version` counter in the room state; bump on every mutation, include in every snapshot.
3. Implement controller offline buffer in `web/shared/ws-client.js`.
4. Implement TV reconnect + full state restore.
5. Implement backend restart recovery walk (if not already done in Phase 2) and write a test for it.
6. Write Playwright scenarios:
   - Phone drops Wi-Fi for 5 seconds mid-turn, throws a dart during the outage, reconnects: dart is accepted exactly once.
   - TV is reloaded mid-leg: restored state matches the DB.
   - Backend `kill -9` mid-leg, restart: leg resumes, next dart is accepted.
7. Load test: 1000 darts submitted in rapid succession — no dedupe false positives, no DB lock errors.

## Acceptance criteria

- Zero double-counted darts across all reconnect scenarios.
- Zero desyncs between controller and TV after any disruption.
- Match data on disk after the chaos tests matches the expected deterministic outcome computed by the engine.

## Handoff

Hands off to `stats-engineer` and `qa-tester`.
