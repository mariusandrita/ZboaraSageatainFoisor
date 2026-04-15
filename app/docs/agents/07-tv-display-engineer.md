# Agent 07 — tv-display-engineer

**Phase:** 4 — TV display
**Model routing:** `sonnet`
**Depends on:** 04-backend-api-engineer, 06-svg-dartboard-specialist
**Unblocks:** 08, 11

---

## Objective

Build the full-screen TV kiosk UI. It never takes input — it only listens to WS events and renders. Layout must read cleanly across the garage from 3+ meters away.

## Inputs

- WS contract from Phase 2.
- `Dartboard.svelte` component from Phase 4.
- Brand colors / player colors palette.

## Outputs

- [ ] `web/tv/` Svelte app with Vite, building to `server/public/tv/`.
- [ ] Screens:
  - `Home.svelte` — idle screen when no match is live. Shows QR code + URL to open the controller on the phone, plus "last match" summary if any.
  - `Match.svelte` — live match view.
  - `Celebration.svelte` — full-screen overlay for 180 / high finish / bull finish / leg won / match won.
- [ ] `Match.svelte` layout (landscape 1920×1080):
  - Left 35%: the `Dartboard.svelte`, zooming to the last dart.
  - Right 65%: player cards stacked. Current thrower's card is wider and glowing. Each card shows:
    - Name, color strip, legs-won pips.
    - Remaining score (huge, 180px).
    - 3-dart average for this match.
    - Current turn: 3 dart chips (e.g. `T20 T20 —`) with running turn total.
  - Bottom bar: checkout suggestion for the current thrower when applicable.
- [ ] Animation: on `dart:added`, the dartboard zooms to the segment over 400 ms (cubic-bezier), pulses the segment, then slowly zooms back out over 800 ms after the next dart starts loading.
- [ ] Sound effects optional (off by default) for 180, leg won, match won.
- [ ] The TV app auto-joins whichever match is `status='live'` via an initial GET `/api/matches?status=live`. If none, shows Home.

## Task checklist

1. Scaffold Svelte + Vite in `web/tv/`.
2. Build the layout in a static mock first with hardcoded state so it can be tuned visually.
3. Integrate `Dartboard.svelte` and wire `highlight` + `zoomTo` to the last dart in the WS state.
4. Subscribe to `match:state`, `dart:added`, `turn:ended`, `leg:won`, `match:won`, `celebration`.
5. Build the celebration overlay component. Keep it < 2 s and dismissible on next WS event.
6. Tune font sizes / contrast for 3 m reading distance on a 40–55" TV.
7. Add `@media (prefers-reduced-motion)` fallback that disables zoom.
8. Build and deploy to `server/public/tv/`.

## Acceptance criteria

- A dart submitted on the phone visibly reflects on the TV within **200 ms** end-to-end on the Pi over LAN.
- Zoom animation holds a steady 60 fps on the Pi 4B at 1080p.
- Refreshing the TV page mid-leg restores full state (depends on Phase 5 recovery).
- No layout shift between player changes.

## Handoff

Hands off to `realtime-sync-engineer` to harden the WS reconnection / recovery flow.
