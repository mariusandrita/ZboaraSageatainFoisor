# Agent 09 — stats-engineer

**Phase:** 6 — Stats & history
**Model routing:** `sonnet`
**Depends on:** 02, 04, 08
**Unblocks:** 11

---

## Objective

Turn the event-sourced `darts` table into player profiles, match history, and leaderboards. Read-only: no mutation paths here.

## Inputs

- Schema + repos from Phase 2.
- Finished matches in SQLite from playtesting.

## Outputs

- [ ] `server/src/stats/aggregate.js` — pure SQL + JS aggregations:
  - `getPlayerStats(playerId)` → `{ matchesPlayed, legsWon, avg3Dart, avgFirst9, checkoutPct, highestFinish, count180, count140Plus, count100Plus }`
  - `getMatchSummary(matchId)` → per-player rows with match-scoped versions of the above.
  - `getLeaderboard({ minMatches=3 })` → array sorted by `avg3Dart`.
  - `getMatchHistory({ limit, offset })` → paginated list of finished matches with winner + scores.
- [ ] SQL views in `server/src/db/migrations/002_stats_views.sql` for the heavy aggregations.
- [ ] New routes in `server/src/routes/stats.js`:
  - `GET /api/stats/leaderboard`
  - `GET /api/players/:id/stats`
  - `GET /api/matches` (history, paginated, filterable by `status=finished`)
  - `GET /api/matches/:id/summary`
- [ ] Controller UI additions:
  - `History.svelte` screen listing recent matches, tap → match summary.
  - `PlayerProfile.svelte` screen showing a player's stats + last 10 matches.
- [ ] TV Home shows top-3 leaderboard when idle.
- [ ] Unit tests for `aggregate.js` against a seeded in-memory DB with a known match outcome.

## Task checklist

1. Manually compute stats for one seeded match in the tests, assert the functions return identical numbers.
2. Decide: compute live (on every request) vs materialize. For a garage league of < 10k darts, live is fine. Keep SQL readable.
3. Implement each function, one at a time, test-first.
4. Build the two Svelte screens. Keep them minimal — lists + cards.
5. Verify the leaderboard on TV Home updates when a match finishes (invalidate on `match:won`).

## Definitions

- **3-dart average** = total score scored / (darts thrown / 3). Busted turns count toward darts thrown but the dart scores are reverted — so the engine must emit a stat-safe "turn total" after a bust (which is 0). Decide and document.
- **First 9 average** = average per-turn score of the first 3 turns per leg.
- **Checkout %** = legs won / leg-ending turn attempts where remaining ≤ 170 at turn start.
- **180** = a turn totaling exactly 180.
- **High finish** = checkout ≥ 100.

Document these in `docs/RULES.md` alongside the game rules so players can't argue with the numbers.

## Acceptance criteria

- Stats shown on the profile page match a hand-computed spreadsheet for a sample 3-match set.
- Leaderboard page loads in < 200 ms on the Pi with 1000+ persisted darts.
- No stat query holds a write lock on the DB during live play.

## Handoff

Hands off to `devops-engineer` and `qa-tester`.
