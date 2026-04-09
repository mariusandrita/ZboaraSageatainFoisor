export const BADGE_LABELS = {
  breakfast: 'English Breakfast',
  shanghai: 'Shanghai',
  blackHat: 'Black Hat',
  bailOut: 'Bail Out',
  bucket: 'Bucket of Nails',
  madhouseEscape: 'Madhouse Escape',
  lunetist: 'Lunetist',
  centrul: 'Centrul',
  matematician: 'Matematician',
  hamster: 'Hamster',
  zugrav: 'Zugrav',
  highFinish: 'High Finish',
  bullFinish: 'Bull Finish',
  ton140: '140+',
  ton100: '100+',
  bigDouble: 'Double 15+',
  bigTriple: 'Triple 15+',
  overAvg: 'Over Average',
  beatGeneral: 'Beat General Avg',
  lowTriple: 'Low Triple',
  threeMisses: 'Three Misses',
  bust: 'Bust',
  '180': '180',
};

const BADGE_COLORS = {
  breakfast: ['#f97316', '#facc15'],
  shanghai: ['#ec4899', '#8b5cf6'],
  blackHat: ['#111827', '#4b5563'],
  bailOut: ['#2563eb', '#38bdf8'],
  bucket: ['#22c55e', '#14b8a6'],
  madhouseEscape: ['#ef4444', '#f97316'],
  lunetist: ['#1d4ed8', '#0f172a'],
  centrul: ['#dc2626', '#f59e0b'],
  matematician: ['#7c3aed', '#c084fc'],
  hamster: ['#f59e0b', '#fcd34d'],
  zugrav: ['#64748b', '#cbd5e1'],
  highFinish: ['#b91c1c', '#fb7185'],
  bullFinish: ['#0f766e', '#2dd4bf'],
  ton140: ['#4f46e5', '#22d3ee'],
  ton100: ['#2563eb', '#22c55e'],
  bigDouble: ['#0f766e', '#84cc16'],
  bigTriple: ['#7c2d12', '#f97316'],
  overAvg: ['#0f766e', '#38bdf8'],
  beatGeneral: ['#166534', '#84cc16'],
  lowTriple: ['#0369a1', '#38bdf8'],
  threeMisses: ['#475569', '#0f172a'],
  bust: ['#7f1d1d', '#ef4444'],
  '180': ['#991b1b', '#f59e0b'],
};

export function awardLabel(kind) {
  return BADGE_LABELS[kind] ?? kind;
}

export function badgesForPlayer(player, limit = 6) {
  return [
    ...(player?.beat_general ? [{ kind: 'beatGeneral', count: 1 }] : []),
    ...((player?.awards ?? []).slice(0, limit)),
  ];
}

export function badgeAssetCandidates(kind) {
  const base = `/assets/badges/${kind}`;
  return [`${base}.png`, `${base}.webp`, `${base}.jpg`, `${base}.jpeg`, `${base}.svg`];
}

export function badgeFallbackDataUri(kind) {
  const label = awardLabel(kind);
  const [from, to] = BADGE_COLORS[kind] ?? ['#1d4ed8', '#60a5fa'];
  const initials = label
    .replace(/[^A-Za-z0-9+ ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || '?';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${label}">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${from}" />
          <stop offset="100%" stop-color="${to}" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="112" height="112" rx="28" fill="url(#g)" />
      <rect x="13" y="13" width="102" height="102" rx="23" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" />
      <text x="64" y="73" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="white">${initials}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
