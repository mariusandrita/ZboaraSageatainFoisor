# Agent 05 — phone-controller-engineer

**Phase:** 3 — Phone controller
**Model routing:** `sonnet`
**Depends on:** 04-backend-api-engineer
**Unblocks:** 08 (realtime) partially, 11 (qa)

---

## Objective

Build the phone-first Svelte app that is the only input device for the system. It must be fast, bulletproof under glove fingers, and usable in a dim garage. Thumb-reachable layout, big tap targets, no accidental presses.

## Inputs

- `docs/ARCHITECTURE.md` §8 (frontend contract).
- REST + WS contract from Phase 2.
- UX notes from this brief.

## Outputs

- [ ] `web/controller/` Svelte app with Vite, building to `server/public/controller/`.
- [ ] Screens:
  - `Home.svelte` — "New match", "Players", "History", "Resume live match" (if one exists).
  - `Players.svelte` — list, add, edit, delete.
  - `NewMatch.svelte` — wizard: pick 2–5 players (drag to reorder throw order), choose 301/501/701, choose legs_to_win, choose double-out toggle, big "Start" button.
  - `ScoreEntry.svelte` — the core screen.
- [ ] `ScoreEntry.svelte` layout:
  - Top strip: current player name + color, remaining score (huge), turn score so far, darts thrown in this turn (3 pips).
  - Middle: **number pad** 1..20 in 4×5 grid + 25 (outer bull) + 50 (bull) buttons.
  - Modifier strip above the pad: `Single / Double / Triple` toggle (sticky within a turn or one-shot, configurable — default one-shot so you tap Triple then tap 20 = T20).
  - Bottom: `Undo`, `Miss (0)`, `End Turn`.
  - Checkout suggestion banner appears when `remaining ≤ 170`.
- [ ] `stores/match.js` — Svelte store backed by the WS client, single source of truth for the UI.
- [ ] `web/shared/ws-client.js` — thin Socket.IO wrapper with reconnect + role=controller on connect.
- [ ] Optimistic UI on `dart:submit` with rollback if server rejects.
- [ ] PWA manifest + icon so the phone can "Add to Home Screen".

## UX rules

1. **No modals during score entry.** Everything is on one screen.
2. **Every tap is one dart.** Triple + 20 = submit T20. The modifier resets after each dart unless the user long-presses it to lock.
3. **Undo is one tap**, lives bottom-left, always available.
4. **Bust** → the screen flashes red for 500 ms, the remaining reverts, haptic buzz.
5. **180** → full-screen celebration overlay for 2 seconds, then back to the pad.
6. **Checkout suggestion** shows e.g. `T20 • T20 • D12` under the remaining score.
7. Portrait only. Lock orientation via CSS + manifest.
8. Color-blind safe player colors (use the palette chosen by `system-architect`).
9. Font size for remaining score ≥ 72 px on a 6" phone.

## Task checklist

1. Scaffold Svelte + Vite in `web/controller/`.
2. Build the WS client wrapper with auto-reconnect and last-known-match memory in `localStorage`.
3. Implement each screen against a mock server (Vite dev proxy to the real backend).
4. Implement the score entry screen in isolation with a Storybook-ish playground page so it can be tuned without a live match.
5. Wire optimistic dart submit + rollback on server error.
6. Hook up celebrations (listen for `celebration` WS events).
7. Add the PWA manifest.
8. Build the bundle and deploy to `server/public/controller/`.

## Acceptance criteria

- On a mid-range Android phone, a full 15-dart turn can be entered in < 10 seconds.
- Accidental double-tap on the same number in under 120 ms is debounced to one dart (safety net).
- Network drop mid-turn: the controller shows a red "offline" pill, buffers inputs, flushes on reconnect.
- Lighthouse mobile performance ≥ 90 on the bundled page over LAN.

## Handoff

Hands off to `realtime-sync-engineer` (Phase 5) to harden reconnect/replay, and to `qa-tester` (Phase 7).
