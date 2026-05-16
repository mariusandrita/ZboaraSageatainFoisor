<script>
  import dartboardUrl from '../../../../Dartboard.svg?url';
  import { SEGMENT_ORDER } from './segments.js';

  export let darts = [];
  export let size = 400;

  const CX = 226.5;
  const CY = 226.5;
  const DEG = Math.PI / 180;
  const sliceAngle = 360 / 20;

  const RADII = {
    bull: 6.9,
    outerBull: 16.45,
    tripleInner: 98.45,
    tripleOuter: 107.55,
    doubleInner: 161.45,
    doubleOuter: 170.55,
  };

  let animationKey = 0;
  let previousDart = null;

  function polar(angleDeg, r) {
    const a = (angleDeg - 90) * DEG;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  }

  function sectorPath(r1, r2, startDeg, endDeg) {
    const [x1, y1] = polar(startDeg, r1);
    const [x2, y2] = polar(endDeg, r1);
    const [x3, y3] = polar(endDeg, r2);
    const [x4, y4] = polar(startDeg, r2);
    const large = endDeg - startDeg > 180 ? 1 : 0;

    return [
      `M ${x1} ${y1}`,
      `A ${r1} ${r1} 0 ${large} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${r2} ${r2} 0 ${large} 0 ${x4} ${y4}`,
      'Z',
    ].join(' ');
  }

  function ringCentre(segIdx, r1, r2) {
    const angle = segIdx * sliceAngle;
    const radius = (r1 + r2) / 2;
    const [x, y] = polar(angle, radius);
    return { x, y };
  }

  function buildHighlight(dart) {
    if (!dart) return null;

    const { segment, multiplier } = dart;

    if (segment === 25 && multiplier === 2) {
      return {
        paths: [],
        circles: [{ cx: CX, cy: CY, r: RADII.bull }],
        hit: { x: CX, y: CY },
      };
    }

    if (segment === 25) {
      return {
        paths: [],
        circles: [{ cx: CX, cy: CY, r: RADII.outerBull }],
        hit: { x: CX, y: CY - (RADII.bull + RADII.outerBull) / 2 },
      };
    }

    const segIdx = SEGMENT_ORDER.indexOf(segment);
    if (segIdx === -1) return null;

    const start = segIdx * sliceAngle - sliceAngle / 2;
    const end = start + sliceAngle;

    if (multiplier === 2) {
      return {
        paths: [sectorPath(RADII.doubleInner, RADII.doubleOuter, start, end)],
        circles: [],
        hit: ringCentre(segIdx, RADII.doubleInner, RADII.doubleOuter),
      };
    }

    if (multiplier === 3) {
      return {
        paths: [sectorPath(RADII.tripleInner, RADII.tripleOuter, start, end)],
        circles: [],
        hit: ringCentre(segIdx, RADII.tripleInner, RADII.tripleOuter),
      };
    }

    return {
      paths: [
        sectorPath(RADII.outerBull, RADII.tripleInner, start, end),
        sectorPath(RADII.tripleOuter, RADII.doubleInner, start, end),
      ],
      circles: [],
      hit: ringCentre(segIdx, RADII.tripleOuter, RADII.doubleInner),
    };
  }

  function toneForDart(dart) {
    if (!dart || dart.busted) return 'tone-miss';
    if (dart.segment === 0) return 'tone-miss';
    if (dart.segment === 25 && dart.multiplier === 2) return 'segment-bull mult-bull';
    if (dart.segment === 25) return 'segment-bull mult-single';

    let segmentTone = 'segment-1-5';
    if (dart.segment >= 16) segmentTone = 'segment-16-20';
    else if (dart.segment >= 11) segmentTone = 'segment-11-15';
    else if (dart.segment >= 6) segmentTone = 'segment-6-10';

    const multiplierTone = dart.multiplier === 3
      ? 'mult-triple'
      : dart.multiplier === 2
        ? 'mult-double'
        : 'mult-single';

    return `${segmentTone} ${multiplierTone}`;
  }

  $: highlights = (darts ?? [])
    .map((dart, index) => {
      const highlight = buildHighlight(dart);
      return highlight ? { ...highlight, index, tone: toneForDart(dart) } : null;
    })
    .filter(Boolean);

  $: latestHighlight = highlights.length > 0 ? highlights[highlights.length - 1] : null;
  $: latestDart = darts.length > 0 ? darts[darts.length - 1] : null;
  $: focusHit = (() => {
    if (!highlights.length) return null;
    const xs = highlights.map((highlight) => highlight.hit.x);
    const ys = highlights.map((highlight) => highlight.hit.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      spread: Math.max(maxX - minX, maxY - minY),
    };
  })();

  $: zoomStyle = (() => {
    if (!focusHit) return 'translate3d(0, 0, 0) scale(1)';
    const scale = Math.max(1.08, Math.min(1.58, 190 / (focusHit.spread + 95)));
    const pxPerUnit = size / 453;
    const tx = (CX - focusHit.x) * pxPerUnit * scale;
    const ty = (CY - focusHit.y) * pxPerUnit * scale;
    return `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
  })();

  $: if (latestDart && latestDart !== previousDart) {
    previousDart = latestDart;
    animationKey += 1;
  }

  $: if (!latestDart) {
    previousDart = null;
  }
</script>

<div class="board-container" style="width:{size}px; height:{size}px">
  <div class="zoom-layer" style="transform:{zoomStyle}">
    <img
      class="board-image"
      src={dartboardUrl}
      alt="dartboard"
      width={size}
      height={size}
      draggable="false"
    />

    {#if highlights.length > 0}
      {#key animationKey}
        <svg
          class="fx-layer"
          viewBox="0 0 453 453"
          aria-hidden="true"
        >
          {#each highlights as highlight}
            <g class={`segment-group ${highlight.tone}`}>
              {#each highlight.paths as path}
                <path d={path} class="flash-shape"></path>
              {/each}

              {#each highlight.circles as circle}
                <circle
                  cx={circle.cx}
                  cy={circle.cy}
                  r={circle.r}
                  class="flash-shape"
                ></circle>
              {/each}
            </g>
          {/each}
        </svg>
      {/key}
    {/if}
  </div>
</div>

<style>
  .board-container {
    position: relative;
    overflow: hidden;
    border-radius: 50%;
    filter: drop-shadow(0 0 24px rgba(0, 0, 0, 0.9));
  }

  .zoom-layer {
    position: absolute;
    inset: 0;
    transform-origin: 50% 50%;
    transition: transform 820ms cubic-bezier(0.22, 0.9, 0.24, 1);
    will-change: transform;
  }

  .board-image {
    display: block;
    user-select: none;
    -webkit-user-drag: none;
  }

  .fx-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }

  .flash-shape {
    stroke-width: 3.4;
    transform-box: fill-box;
    transform-origin: center;
    animation: segmentPulse 700ms cubic-bezier(0.2, 0.9, 0.25, 1);
  }

  .segment-group.segment-1-5 {
    --hit-fill: rgba(255, 92, 145, 0.82);
    --hit-stroke: rgba(255, 224, 235, 1);
    --hit-glow: rgba(255, 92, 145, 0.98);
  }

  .segment-group.segment-6-10 {
    --hit-fill: rgba(180, 119, 255, 0.82);
    --hit-stroke: rgba(240, 228, 255, 1);
    --hit-glow: rgba(180, 119, 255, 0.98);
  }

  .segment-group.segment-11-15 {
    --hit-fill: rgba(255, 181, 70, 0.84);
    --hit-stroke: rgba(255, 240, 216, 1);
    --hit-glow: rgba(255, 181, 70, 0.98);
  }

  .segment-group.segment-16-20 {
    --hit-fill: rgba(255, 219, 77, 0.88);
    --hit-stroke: rgba(255, 246, 201, 1);
    --hit-glow: rgba(255, 219, 77, 0.98);
  }

  .segment-group.segment-bull {
    --hit-fill: rgba(255, 239, 165, 0.88);
    --hit-stroke: rgba(255, 250, 222, 1);
    --hit-glow: rgba(255, 239, 165, 1);
  }

  .segment-group.mult-double {
    --hit-stroke: rgba(72, 219, 251, 1);
    --hit-glow: rgba(72, 219, 251, 1);
  }

  .segment-group.mult-triple {
    --hit-stroke: rgba(121, 255, 126, 1);
    --hit-glow: rgba(121, 255, 126, 1);
  }

  .segment-group.mult-bull {
    --hit-stroke: rgba(255, 250, 222, 1);
    --hit-glow: rgba(255, 239, 165, 1);
  }

  .segment-group.mult-double .flash-shape {
    stroke-width: 5.6;
    filter:
      drop-shadow(0 0 20px var(--hit-glow))
      drop-shadow(0 0 34px var(--hit-glow));
  }

  .segment-group.mult-triple .flash-shape {
    stroke-width: 6;
    filter:
      drop-shadow(0 0 20px var(--hit-glow))
      drop-shadow(0 0 36px var(--hit-glow));
  }

  .segment-group.mult-bull .flash-shape {
    stroke-width: 6.2;
    filter:
      drop-shadow(0 0 20px var(--hit-glow))
      drop-shadow(0 0 36px var(--hit-glow));
  }

  .segment-group[class*='segment-'] .flash-shape {
    fill: var(--hit-fill);
    stroke: var(--hit-stroke);
    filter: drop-shadow(0 0 18px var(--hit-glow));
  }

  .tone-miss .flash-shape {
    fill: rgba(255, 255, 255, 0.2);
    stroke: rgba(255, 255, 255, 0.6);
    filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.4));
  }

  @keyframes segmentPulse {
    0% {
      opacity: 0.22;
      transform: scale(0.88);
    }
    40% {
      opacity: 1;
      transform: scale(1.06);
    }
    72% {
      opacity: 1;
      transform: scale(1.02);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
