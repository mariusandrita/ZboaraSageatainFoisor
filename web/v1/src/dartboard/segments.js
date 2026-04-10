/**
 * SVG dartboard segment geometry.
 * The board is a 400×400 viewBox, centre at (200,200).
 *
 * Segment order clockwise from top: 20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5
 * Each segment occupies 360/20 = 18 degrees.
 */

export const SEGMENT_ORDER = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];

// Radii (in SVG units, board radius = 190)
export const R = {
  bull:       15,   // bullseye (double bull)
  outerBull:  30,   // outer bull (single bull)
  innerSingle:75,  // inner single ring inner edge
  triple:     100,  // triple ring inner edge
  tripleOuter:112,  // triple ring outer edge
  outerSingle:160,  // outer single ring outer edge (inner edge of double)
  double:     175,  // double ring outer edge
  board:      190,  // outer board boundary
};

const CX = 200, CY = 200;
const DEG = Math.PI / 180;

/** Convert polar (deg from top, r) to SVG cartesian */
function polar(angleDeg, r) {
  const a = (angleDeg - 90) * DEG;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

/** Build an SVG arc path for a sector */
function sectorPath(r1, r2, startDeg, endDeg) {
  const [x1, y1] = polar(startDeg, r1);
  const [x2, y2] = polar(endDeg,   r1);
  const [x3, y3] = polar(endDeg,   r2);
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

/**
 * Build the full list of dartboard segments as SVG path data.
 * Returns an array of { id, segment, multiplier, path, cx, cy }
 */
export function buildSegments() {
  const segments = [];
  const sliceAngle = 360 / 20;

  SEGMENT_ORDER.forEach((seg, idx) => {
    const start = idx * sliceAngle - sliceAngle / 2; // centre the segment
    const end = start + sliceAngle;

    // Outer single
    segments.push({
      id: `s${seg}-1`,
      segment: seg,
      multiplier: 1,
      ring: 'outer',
      path: sectorPath(R.tripleOuter, R.double, start, end),
      ...midPoint(R.tripleOuter, R.double, start, end),
    });

    // Triple ring
    segments.push({
      id: `t${seg}`,
      segment: seg,
      multiplier: 3,
      ring: 'triple',
      path: sectorPath(R.triple, R.tripleOuter, start, end),
      ...midPoint(R.triple, R.tripleOuter, start, end),
    });

    // Inner single
    segments.push({
      id: `s${seg}-1i`,
      segment: seg,
      multiplier: 1,
      ring: 'inner',
      path: sectorPath(R.outerBull, R.triple, start, end),
      ...midPoint(R.outerBull, R.triple, start, end),
    });

    // Double ring
    segments.push({
      id: `d${seg}`,
      segment: seg,
      multiplier: 2,
      ring: 'double',
      path: sectorPath(R.double, R.board, start, end),
      ...midPoint(R.double, R.board, start, end),
    });
  });

  // Outer bull (25×1)
  segments.push({
    id: 'obull',
    segment: 25,
    multiplier: 1,
    ring: 'outerBull',
    path: `M ${CX} ${CY} m -${R.outerBull} 0 a ${R.outerBull} ${R.outerBull} 0 1 0 ${R.outerBull * 2} 0 a ${R.outerBull} ${R.outerBull} 0 1 0 -${R.outerBull * 2} 0`,
    cx: CX, cy: CY,
  });

  // Bullseye (25×2 = 50)
  segments.push({
    id: 'bull',
    segment: 25,
    multiplier: 2,
    ring: 'bull',
    path: `M ${CX} ${CY} m -${R.bull} 0 a ${R.bull} ${R.bull} 0 1 0 ${R.bull * 2} 0 a ${R.bull} ${R.bull} 0 1 0 -${R.bull * 2} 0`,
    cx: CX, cy: CY,
  });

  return segments;
}

function midPoint(r1, r2, startDeg, endDeg) {
  const midAngle = (startDeg + endDeg) / 2;
  const midR = (r1 + r2) / 2;
  const [cx, cy] = polar(midAngle, midR);
  return { cx, cy };
}

/** Returns the fill colour for a given segment/ring combination */
export function segmentColor(seg, ring, highlighted = false) {
  if (highlighted) return '#ffe066';
  if (ring === 'bull')      return '#e63946';
  if (ring === 'outerBull') return '#4caf50';
  if (ring === 'double' || ring === 'triple') {
    const idx = SEGMENT_ORDER.indexOf(seg);
    return idx % 2 === 0 ? '#e63946' : '#4caf50';
  }
  // single rings alternate black/cream
  const idx = SEGMENT_ORDER.indexOf(seg);
  return idx % 2 === 0 ? '#1a1a1a' : '#f5e6c8';
}
