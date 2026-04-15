# Agent 03 — game-engine-engineer

**Phase:** 2 — Backend core
**Model routing:** `opus` (rules are subtle; worth the extra care)
**Depends on:** 01-system-architect
**Unblocks:** 04, 05

---

## Objective

Build the **pure, deterministic X01 game engine**. No I/O. Given a leg state and a dart, return the new leg state, plus any celebration events to emit. This module is the single place that knows X01 rules, and it is unit-tested to death.

## Inputs

- `docs/ARCHITECTURE.md` §7 — engine contract.
- PDC/DartConnect rulebook for X01 double-out edge cases (online reference).
- `server/src/engine/types.js` from Phase 1.

## Outputs

- [ ] `server/src/engine/x01.js` with exported pure functions:
  - `newLeg({ startingScore, doubleOut, players, startingPlayerIdx })`
  - `submitDart(state, { segment, multiplier })`
  - `undoDart(state)`
  - `isBust(state, dart)` (internal helper)
  - `isCheckout(state, dart)` (internal helper)
- [ ] `server/src/engine/checkouts.js` — lookup tables for suggested finishes for remaining ∈ [2..170] with 1/2/3 darts in hand, double-out variant.
- [ ] `server/src/engine/x01.test.js` — exhaustive Vitest suite.
- [ ] `docs/RULES.md` — human-readable description of the exact rules the engine implements, so players can't argue.

## Rules the engine must enforce

1. Start at `startingScore` (301/501/701), subtract each dart's `segment * multiplier`.
2. Remaining cannot go below 0.
3. Turn ends after 3 darts, a bust, or a checkout.
4. **Bust** (double-out mode) — turn's darts are undone, `remaining` reverts to `turnStartRemaining`:
   - remaining would go below 0
   - remaining would land on 1 (can't finish on 1)
   - remaining hits 0 but the finishing dart was not a double
5. **Bust** (straight-out mode): only on `< 0`.
6. **Checkout**: remaining hits exactly 0, and (double-out) the last dart was a double. Bull (25×2=50) counts as a double.
7. **180** celebration: sum of 3 darts in a turn = 180.
8. **High finish** celebration: checkout ≥ 100.
9. **Bull finish** celebration: the checkout dart is the bullseye (25×2).
10. `undoDart` pops the last dart. If the last action was a bust-revert, undo restores the bust turn state for inspection, not the pre-bust state.

## Unit test checklist (minimum)

- [ ] 501 straight game, 9-dart finish (T20, T20, T20, T20, T20, T20, T20, T19, D12).
- [ ] 301 double-out, bust on going below 0.
- [ ] 501 double-out, bust on remaining = 1.
- [ ] 501 double-out, bust on landing 0 with a single.
- [ ] 501 double-out, valid checkout on D16.
- [ ] Bull checkout: 501 → ... → 50, dart = 25×2, should checkout.
- [ ] 180 celebration: T20+T20+T20.
- [ ] High finish: remaining=100, T20+S20+D20.
- [ ] Turn ends after 3 darts even without checkout.
- [ ] Undo dart mid-turn restores prior state.
- [ ] Undo across turns is allowed.
- [ ] Player rotation after turn end.
- [ ] 2/3/5 player legs all rotate correctly.
- [ ] Suggested checkout for 170 is T20-T20-Bull.

## Acceptance criteria

- 100% branch coverage on `x01.js` and `checkouts.js`.
- No external imports other than `./types.js`, `./checkouts.js`. No `fs`, `sqlite`, etc.
- All edge cases above covered by named tests.

## Handoff

Hands off to `backend-api-engineer` who wraps this module behind HTTP + WS.
