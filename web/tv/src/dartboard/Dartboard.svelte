<script>
  /**
   * Uses the real Dartboard.svg as the board visual.
   * Overlays a canvas hit-marker and applies zoom-to-segment animation.
   *
   * Real SVG: viewBox="0 0 453 453", centre (226.5, 226.5)
   */
  import { SEGMENT_ORDER } from './segments.js';

  export let lastDart = null;   // { segment, multiplier } or null
  export let size = 400;

  // Real board geometry (matches Dartboard.svg exactly)
  const CX = 226.5, CY = 226.5;
  const RADII = {
    bull:        6.9,
    outerBull:  16.45,
    tripleInner: 98.45,
    tripleOuter: 107.55,
    doubleInner: 161.45,
    doubleOuter: 170.55,
  };

  const DEG = Math.PI / 180;
  const sliceAngle = 360 / 20;

  /** Polar (angle from top in degrees, radius) → [x, y] in 453×453 space */
  function polar(angleDeg, r) {
    const a = (angleDeg - 90) * DEG;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  }

  /** Centre point of a ring at a given segment index */
  function segmentCentre(segIdx, r1, r2) {
    const midAngle = segIdx * sliceAngle;
    const midR = (r1 + r2) / 2;
    const [x, y] = polar(midAngle, midR);
    return { x, y };
  }

  /** Returns { x, y } of the hit centre for a dart, in 453×453 coords */
  function hitCentre(dart) {
    if (!dart) return null;
    const { segment, multiplier } = dart;

    if (segment === 25 && multiplier === 2) return { x: CX, y: CY };              // bullseye
    if (segment === 25 && multiplier === 1) return { x: CX, y: CY - (RADII.outerBull + RADII.bull) / 2 }; // outer bull

    const idx = SEGMENT_ORDER.indexOf(segment);
    if (idx === -1) return null;

    if (multiplier === 2) return segmentCentre(idx, RADII.doubleInner, RADII.doubleOuter);
    if (multiplier === 3) return segmentCentre(idx, RADII.tripleInner, RADII.tripleOuter);
    // single: mid of outer single ring (between triple outer and double inner)
    return segmentCentre(idx, RADII.tripleOuter, RADII.doubleInner);
  }

  $: hit = lastDart ? hitCentre(lastDart) : null;

  // Zoom: scale=2.8 centred on hit point, translate to keep hit at board centre
  $: zoomStyle = (() => {
    if (!hit) return 'translateZ(0)';
    const scale = 2.8;
    const tx = CX - hit.x * scale;
    const ty = CY - hit.y * scale;
    return `translate(${tx}px, ${ty}px) scale(${scale})`;
  })();

  // Canvas hit animation
  let canvas;
  let animRaf = null;

  const ANIM_DURATION = 800; // ms

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function drawHitAnimation(hitPos) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const scale = size / 453;
    const cx = hitPos.x * scale;
    const cy = hitPos.y * scale;
    const startTime = performance.now();

    function frame(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / ANIM_DURATION, 1);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // — Dot: pops in with overshoot, stays visible
      const dotT = Math.min(elapsed / 300, 1);
      const dotScale = easeOutBack(dotT);
      const dotR = 5 * scale * dotScale;
      const dotOpacity = dotT < 1 ? 1 : Math.max(0, 1 - (elapsed - 300) / 500);
      if (dotR > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${dotOpacity})`;
        ctx.fill();
      }

      // — Crosshair: appears fast then fades
      const crossT = Math.min(elapsed / 250, 1);
      const crossOpacity = crossT < 1 ? crossT : Math.max(0, 1 - (elapsed - 150) / 450);
      if (crossOpacity > 0) {
        const arm = 12 * scale;
        ctx.save();
        ctx.strokeStyle = `rgba(255,255,255,${crossOpacity * 0.9})`;
        ctx.lineWidth = 1.5 * scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - arm, cy);
        ctx.lineTo(cx + arm, cy);
        ctx.moveTo(cx, cy - arm);
        ctx.lineTo(cx, cy + arm);
        ctx.stroke();
        ctx.restore();
      }

      // — Inner ripple ring: radius 0 → 30*scale, fades out
      const ring1T = easeOut(Math.min(elapsed / 600, 1));
      const ring1R = ring1T * 30 * scale;
      const ring1Opacity = Math.max(0, 1 - elapsed / 600) * 0.85;
      if (ring1Opacity > 0 && ring1R > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, ring1R, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${ring1Opacity})`;
        ctx.lineWidth = 2.5 * scale;
        ctx.stroke();
      }

      // — Outer ripple ring: delayed by 150ms, radius 0 → 50*scale, fades out
      const ring2Elapsed = Math.max(0, elapsed - 150);
      const ring2T = easeOut(Math.min(ring2Elapsed / 600, 1));
      const ring2R = ring2T * 50 * scale;
      const ring2Opacity = Math.max(0, 1 - ring2Elapsed / 600) * 0.55;
      if (ring2Opacity > 0 && ring2R > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, ring2R, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${ring2Opacity})`;
        ctx.lineWidth = 2 * scale;
        ctx.stroke();
      }

      if (t < 1) {
        animRaf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        animRaf = null;
      }
    }

    animRaf = requestAnimationFrame(frame);
  }

  $: {
    if (animRaf !== null) {
      cancelAnimationFrame(animRaf);
      animRaf = null;
    }
    if (hit && canvas) {
      drawHitAnimation(hit);
    } else if (!hit && canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
</script>

<div class="board-container" style="width:{size}px; height:{size}px">
  <!-- Zoom wrapper: applies to both real board and canvas together -->
  <div class="zoom-layer" style="transform-origin: {CX / 453 * 100}% {CY / 453 * 100}%; transform:{zoomStyle}">

    <!-- Real dartboard SVG -->
    <img
      src="/dartboard.svg"
      alt="dartboard"
      width={size}
      height={size}
      draggable="false"
    />

    <!-- Canvas hit-marker overlay -->
    <canvas
      bind:this={canvas}
      width={size}
      height={size}
      style="position:absolute; top:0; left:0; pointer-events:none;"
    ></canvas>

  </div>
</div>

<style>
  .board-container {
    position: relative;
    filter: drop-shadow(0 0 24px rgba(0,0,0,0.9));
    overflow: hidden;
    border-radius: 50%;
  }

  .zoom-layer {
    position: absolute;
    inset: 0;
    transition: transform 0.65s cubic-bezier(0.34, 1.26, 0.64, 1);
    will-change: transform;
    transform: translateZ(0);
  }

  img {
    display: block;
    user-select: none;
    -webkit-user-drag: none;
  }
</style>
