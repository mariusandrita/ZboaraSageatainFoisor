# Agent 02 — database-engineer

**Phase:** 2 — Backend core
**Model routing:** `sonnet`
**Depends on:** 01-system-architect
**Unblocks:** 03, 04, 09

---

## Objective

Stand up SQLite via `better-sqlite3` with the frozen schema, migrations, WAL mode, and a clean connection module that every other server module consumes. Build the query layer for players, matches, legs, darts.

## Inputs

- `docs/ARCHITECTURE.md` §4 (data model).
- `server/src/db/schema.sql` (from Phase 1).

## Outputs

- [ ] `server/src/db/connection.js` — opens DB at `/var/lib/dartsleague/darts.sqlite`, enables `PRAGMA journal_mode=WAL; foreign_keys=ON; synchronous=NORMAL;`, runs migrations on boot.
- [ ] `server/src/db/migrations/001_init.sql` — initial schema from `schema.sql`.
- [ ] `server/src/db/migrations/runner.js` — idempotent migration runner driven by a `schema_migrations` table.
- [ ] `server/src/db/repos/players.js` — CRUD + soft delete.
- [ ] `server/src/db/repos/matches.js` — create match, attach players, transition status.
- [ ] `server/src/db/repos/legs.js` — create leg, close leg.
- [ ] `server/src/db/repos/darts.js` — append dart (transactional with leg state update), undo last dart.
- [ ] `server/src/db/repos/*.test.js` — Vitest suites exercising each repo against an in-memory SQLite DB.
- [ ] `ops/scripts/backup.sh` — `VACUUM INTO` daily snapshot, 14-day rotation.

## Task checklist

1. Install `better-sqlite3` and pin its version against Node 20.
2. Confirm it builds on the Pi (arm64) — run `npm rebuild better-sqlite3` on the Pi once.
3. Wire up the migration runner with checksum verification.
4. Implement each repo. All multi-statement operations go through `db.transaction(() => ...)`.
5. Write repo unit tests against `new Database(':memory:')`.
6. Implement `ops/scripts/backup.sh` and a matching systemd timer unit.
7. Document every repo function with JSDoc.

## Acceptance criteria

- `npm test -w server` passes on the Pi.
- Inserting 10 000 dart rows takes < 500 ms on the Pi (WAL batched in one transaction).
- Backup script produces a valid `.sqlite` file readable by `sqlite3 darts-YYYY-MM-DD.sqlite .schema`.
- Killing the Node process mid-insert (via SIGKILL) does not corrupt the DB; on next open, WAL replays cleanly.

## Handoff

Hands off to `backend-api-engineer` (needs repos for routes) and `game-engine-engineer` (needs the dart append path).
