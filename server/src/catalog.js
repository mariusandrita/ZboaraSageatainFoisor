import { existsSync, readdirSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BADGE_ASSET_DIR = join(__dirname, '..', 'public', 'assets', 'badges');
export const BADGE_ASSET_EXTENSIONS = ['.png', '.webp', '.jpg', '.jpeg', '.svg'];

export const AWARD_PRIORITY = [
  'breakfast',
  'shanghai',
  'blackHat',
  'bailOut',
  'bucket',
  'madhouseEscape',
  'lunetist',
  'centrul',
  'matematician',
  'hamster',
  'zugrav',
  '180',
  'highFinish',
  'bullFinish',
  'bigTriple',
  'bigDouble',
  'overAvg',
  'ton140',
  'ton100',
  'lowTriple',
  'threeMisses',
  'bust',
  'beatGeneral',
];

export const BADGE_CATALOG = [
  { kind: '180', label: '180', description: 'Maximum turn. Classic scoreboard highlight and tracked badge.' },
  { kind: 'breakfast', label: 'English Breakfast', description: 'Single 1, single 5 and single 20 in the same visit.' },
  { kind: 'shanghai', label: 'Shanghai', description: 'Single, double and triple on the same number in one visit.' },
  { kind: 'blackHat', label: 'Black Hat', description: 'Three double-bulls in a single visit.' },
  { kind: 'bailOut', label: 'Bail Out', description: 'Weak first two darts, saved by a strong third dart.' },
  { kind: 'bucket', label: 'Bucket of Nails', description: 'Chaotic spread across the board, but still memorable.' },
  { kind: 'madhouseEscape', label: 'Madhouse Escape', description: 'Checkout on double 1.' },
  { kind: 'lunetist', label: 'Lunetist', description: 'Triple 1. Incredible precision on the wrong target.' },
  { kind: 'centrul', label: 'Centrul', description: 'Bull hit that was not the winning checkout dart.' },
  { kind: 'matematician', label: 'Matematician', description: 'Bust from a very small remaining score.' },
  { kind: 'hamster', label: 'Hamster', description: 'All darts land on the board, but the turn total stays under 20.' },
  { kind: 'zugrav', label: 'Zugrav', description: 'A full miss outside the board.' },
  { kind: 'highFinish', label: 'High Finish', description: 'Checkout of 100 or more.' },
  { kind: 'bullFinish', label: 'Bull Finish', description: 'Checkout finished on double bull.' },
  { kind: 'bigTriple', label: 'Triple 15+', description: 'Triple hit on a high segment from 15 to 20.' },
  { kind: 'bigDouble', label: 'Double 15+', description: 'Double hit on a high segment from 15 to 20.' },
  { kind: 'overAvg', label: 'Over Average', description: 'Visit beat the player live turn average.' },
  { kind: 'ton140', label: '140+', description: 'Turn total of 140 to 179.' },
  { kind: 'ton100', label: '100+', description: 'Turn total of 100 to 139.' },
  { kind: 'lowTriple', label: 'Low Triple', description: 'Triple hit on a low segment up to 5.' },
  { kind: 'threeMisses', label: 'Three Misses', description: 'All three darts score zero in the visit.' },
  { kind: 'bust', label: 'Bust', description: 'Turn goes over the finish or breaks double-out rules.' },
  { kind: 'beatGeneral', label: 'Beat General Avg', description: 'Match average finished above the player general average before the match.' },
];

export const CELEBRATION_CATALOG = [
  { kind: '180', label: '180', subtitle: 'MAXIMUM!', description: 'Standard maximum-turn celebration.', group: 'score', awardsBadge: true },
  { kind: 'legWon', label: 'LEG', subtitle: 'MANȘĂ CÂȘTIGATĂ!', description: 'Shown when a player wins a leg.', group: 'match', awardsBadge: false },
  { kind: 'highFinish', label: 'High Finish', subtitle: 'FINALIZARE ÎNALTĂ!', description: 'Checkout of 100 or more.', group: 'finish', awardsBadge: true },
  { kind: 'bullFinish', label: 'Bull Finish', subtitle: 'FINALIZARE BULL!', description: 'Checkout finished on bull.', group: 'finish', awardsBadge: true },
  { kind: 'bust', label: 'Bust', subtitle: 'PREA MULT!', description: 'Bust state shown immediately on TV.', group: 'score', awardsBadge: true },
  { kind: 'ton140', label: '140+', subtitle: 'MAGNIFIC!', description: 'Big scoring turn from 140 up.', group: 'score', awardsBadge: true },
  { kind: 'ton100', label: '100+', subtitle: 'CLUB 100+!', description: 'Scoring turn above 100.', group: 'score', awardsBadge: true },
  { kind: 'threeMisses', label: 'Three Misses', subtitle: 'TREI RATATE!', description: 'All three darts miss scoring.', group: 'score', awardsBadge: true },
  { kind: 'lowTriple', label: 'Low Triple', subtitle: 'CEL PUȚIN L-AI NIMERIT!', description: 'Triple on a low number.', group: 'score', awardsBadge: true },
  { kind: 'bigDouble', label: 'Double 15+', subtitle: 'DUBLĂ GREA!', description: 'High double hit.', group: 'score', awardsBadge: true },
  { kind: 'bigTriple', label: 'Triple 15+', subtitle: 'TRIPLĂ GREA!', description: 'High triple hit.', group: 'score', awardsBadge: true },
  { kind: 'overAvg', label: 'Over Average', subtitle: 'PESTE MEDIA TA!', description: 'Beats live average, used for TV only and not persisted as badge.', group: 'score', awardsBadge: false },
  { kind: 'shanghai', label: 'Shanghai', subtitle: 'SHANGHAI!', description: 'Single, double and triple on the same number.', group: 'funny', awardsBadge: true },
  { kind: 'blackHat', label: 'Black Hat', subtitle: 'BLACK HAT!', description: 'Three double-bulls in one visit.', group: 'funny', awardsBadge: true },
  { kind: 'bailOut', label: 'Bail Out', subtitle: 'BAIL OUT!', description: 'A bad turn rescued by the last dart.', group: 'funny', awardsBadge: true },
  { kind: 'bucket', label: 'Bucket of Nails', subtitle: 'BUCKET OF NAILS!', description: 'Scattered visit with chaotic spread.', group: 'funny', awardsBadge: true },
  { kind: 'madhouseEscape', label: 'Madhouse Escape', subtitle: 'MADHOUSE ESCAPE!', description: 'Checkout on double 1.', group: 'funny', awardsBadge: true },
  { kind: 'lunetist', label: 'Lunetist', subtitle: 'LUNETISTUL CONFUZ!', description: 'Triple 1 celebration.', group: 'funny', awardsBadge: true },
  { kind: 'breakfast', label: 'English Breakfast', subtitle: 'MIC DEJUN ENGLEZESC!', description: 'Single 1, 5, 20 in one visit.', group: 'funny', awardsBadge: true },
  { kind: 'zugrav', label: 'Zugrav', subtitle: 'SE CAUTĂ MESERIAȘ!', description: 'Missed the board entirely.', group: 'funny', awardsBadge: true },
  { kind: 'hamster', label: 'Hamster', subtitle: 'EFORT MAXIM, REZULTAT MINIM!', description: 'All darts hit, total still under 20.', group: 'funny', awardsBadge: true },
  { kind: 'matematician', label: 'Matematician', subtitle: 'CALCUL GREȘIT!', description: 'Bust from a tiny remaining score.', group: 'funny', awardsBadge: true },
  { kind: 'centrul', label: 'Centrul', subtitle: 'DAR NU ERA MOMENTUL...', description: 'Bull hit, but not for checkout.', group: 'funny', awardsBadge: true },
  { kind: 'beatGeneral', label: 'Beat General Avg', subtitle: 'PESTE MEDIA GENERALĂ!', description: 'Match-finish milestone awarded after the result is final.', group: 'post-match', awardsBadge: true },
];

export const EXPERIMENTAL_CELEBRATION_IDEAS = [
  {
    kind: 'robinHood',
    label: 'Robin Hood',
    status: 'manual-only',
    description: 'Classic Robin Hood means one dart splitting or landing into another. The current app cannot detect dart-to-dart collisions from score input alone.',
  },
  {
    kind: 'bucket',
    label: 'Bucket of Nails',
    status: 'implemented',
    description: 'Already implemented and visible in the celebration pipeline.',
  },
  {
    kind: 'blackHat',
    label: 'Black Hat',
    status: 'implemented',
    description: 'Already implemented and awarded for three double-bulls in a visit.',
  },
  {
    kind: 'shanghai',
    label: 'Shanghai',
    status: 'implemented',
    description: 'Already implemented and awarded for single, double and triple on the same number.',
  },
  {
    kind: 'bailOut',
    label: 'Bail Out',
    status: 'implemented',
    description: 'Already implemented and awarded when the last dart rescues a weak visit.',
  },
  {
    kind: 'madhouseEscape',
    label: 'Madhouse Escape',
    status: 'implemented',
    description: 'Already implemented for checkouts on double 1.',
  },
];

export function listBadgeAssets() {
  if (!existsSync(BADGE_ASSET_DIR)) return new Map();

  const files = readdirSync(BADGE_ASSET_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  const byKind = new Map();
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!BADGE_ASSET_EXTENSIONS.includes(ext)) continue;
    const kind = file.slice(0, -ext.length);
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(file);
  }

  return byKind;
}
