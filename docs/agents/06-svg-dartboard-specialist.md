# Agent 06 — svg-dartboard-specialist

**Phase:** 4 — TV display
**Model routing:** `sonnet`
**Depends on:** 01-system-architect
**Unblocks:** 07-tv-display-engineer

---

## Objective

Convert the provided `view-dartboard.jpg` into a clean, scalable, **segment-addressable SVG** that the TV app can animate: highlight a segment, zoom to it, flash it. This is the visual spine of the TV display.

## Inputs

- `/Users/mariusandrita/Dockers/DartsLeague/view-dartboard.jpg` — the source image the user will provide.
- Reference dart geometry: 20 numbered segments, each split into single outer, triple ring, single inner, double ring; plus outer bull (25) and inner bull (50 = bullseye). Standard segment order clockwise from the top: **20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5**.

## Outputs

- [ ] `web/tv/src/dartboard/dartboard.svg` — a hand-crafted SVG with:
  - `viewBox="0 0 1000 1000"` centered.
  - Each segment as a `<path>` with `id="seg-<segment>-<ring>"` e.g. `seg-20-triple`, `seg-20-double`, `seg-20-outer`, `seg-20-inner`, `seg-bull-25`, `seg-bull-50`.
  - A `<g id="board">` wrapping everything so it can be transformed as a unit.
  - Numbers rendered as `<text>` outside the outer double ring, class `seg-label`.
- [ ] `web/tv/src/dartboard/segments.js` — a lookup table from `(segment, multiplier)` → SVG element id + the centroid `{cx, cy}` in viewBox coordinates. Used by the animation layer to compute zoom targets.
- [ ] `web/tv/src/dartboard/Dartboard.svelte` — a Svelte component that:
  - Renders the SVG inline (imported via `?raw` or as a component).
  - Exposes a prop `highlight: {segment, multiplier} | null`.
  - Exposes a prop `zoomTo: {cx, cy, scale} | null`.
  - Applies a CSS transform on `#board` for zoom, and toggles a `.active` class on the highlighted segment for a brief pulse.
- [ ] `web/tv/src/dartboard/Dartboard.stories.svelte` — a playground page that cycles through every segment so the specialist can eyeball correctness.

## Task checklist

1. Open `view-dartboard.jpg` in Inkscape (or vector it via `potrace` after threshold). The user will provide the reference image; if it's a photograph, rebuild the board geometrically from first principles using the specs below rather than tracing pixels.
2. Build the dartboard **mathematically** in a script (e.g. a one-off Node script in `ops/scripts/gen-dartboard-svg.mjs`) that emits the SVG from geometry rules:
   - Outer double ring outer radius: 170 mm (scaled to viewBox).
   - Double ring width: 8 mm.
   - Triple ring at 107 mm outer, 99 mm inner (8 mm wide).
   - Outer bull radius: 16 mm; inner bull radius: 6.35 mm.
   - 20 wedges of 18° each, rotated so segment 20 is centered at the top (−90° + 9°).
3. Alternate wedge colors cream/black and green/red for double + triple per standard board.
4. Verify every segment id is reachable by clicking through the storybook page.
5. Compute centroids (cartesian midpoint of ring arc, angle midpoint of wedge) for every `(segment, multiplier)` pair; ship in `segments.js`.
6. Keep the SVG under 40 KB (gzipped under 10 KB). No embedded rasters.

## Acceptance criteria

- Every dart that the engine can emit has a matching centroid in `segments.js` (including 25, 50, and 0 = miss which maps to a "MISS" area outside the board).
- Zooming to any segment at scale 4× keeps the segment visibly centered in the viewport.
- The SVG renders identically in Chromium on the Pi and in desktop Chrome/Firefox.
- GPU-friendly: zoom is a single `transform: translate() scale()` on `#board`, no reflow.

## Handoff

Hands off to `tv-display-engineer` who will drop this component into the TV app and drive it from WS events.
