import { existsSync, readdirSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BADGE_ASSET_DIR = join(__dirname, '..', 'public', 'assets', 'badges');
export const BADGE_ASSET_EXTENSIONS = ['.png', '.webp', '.jpg', '.jpeg', '.svg'];
const BADGE_ASSET_EXTENSION_PRIORITY = ['.png', '.webp', '.jpg', '.jpeg', '.svg'];

export const AWARD_PRIORITY = [
  'nineDarter',
  '180',
  'blackHat',
  'shanghai',
  'highFinish',
  'bullFinish',
  'bigTriple',
  'bigDouble',
  'ton140',
  'ton100',
  'bailOut',
  'madhouseEscape',
  'motown',
  'route66',
  'allTheFives',
  'twoFatLadies',
  'breakfast',
  'lunetist',
  'centrul',
  'bucket',
  'matematician',
  'zugrav',
  'hamster',
  'champagneShower',
  'circleIt',
  'lowTriple',
  'threeMisses',
  'bust',
  'overAvg',
  'beatGeneral',
];

export function awardPriorityIndex(kind) {
  const index = AWARD_PRIORITY.indexOf(kind);
  return index === -1 ? AWARD_PRIORITY.length : index;
}

export function sortBadgesByPriority(items = []) {
  return [...items].sort((a, b) =>
    awardPriorityIndex(a.kind) - awardPriorityIndex(b.kind)
    || (a.label ?? a.kind).localeCompare(b.label ?? b.kind)
  );
}

export const BADGE_CATALOG = [
  { kind: '180', label: '180', description: 'Tură maximă. Cel mai urmărit moment de pe tablă.' },
  { kind: 'breakfast', label: 'English Breakfast', description: 'Simplu 1, simplu 5 și simplu 20 în aceeași tură.' },
  { kind: 'shanghai', label: 'Shanghai', description: 'Simplu, dublă și triplă pe același număr într-o singură tură.' },
  { kind: 'blackHat', label: 'Pălăria Neagră', description: 'Trei double-bull într-o singură tură.' },
  { kind: 'bailOut', label: 'Salvare', description: 'Primele două săgeți slabe, salvate de a treia.' },
  { kind: 'bucket', label: 'Sac cu Cuie', description: 'Răspândit haotic pe tablă, dar de neuitat.' },
  { kind: 'madhouseEscape', label: 'Madhouse Escape', description: 'Finish pe double 1. Ai supraviețuit casei nebunilor.' },
  { kind: 'lunetist', label: 'Lunetist', description: 'Triplu 1. Precizie incredibilă pe ținta greșită.' },
  { kind: 'centrul', label: 'Centrul', description: 'Bull nimerit, dar nu ca săgeată de finish.' },
  { kind: 'matematician', label: 'Matematician', description: 'Bust dintr-un scor rămas foarte mic. Matematica a trădat.' },
  { kind: 'hamster', label: 'Hamster', description: 'Toate săgețile au nimerit tabla, dar totalul turei rămâne sub 20.' },
  { kind: 'zugrav', label: 'Zugrav', description: 'Săgeată complet ratată în afara tablei.' },
  { kind: 'highFinish', label: 'High Finish', description: 'Finish de 100 sau mai mult.' },
  { kind: 'bullFinish', label: 'Bull Finish', description: 'Finish pe double bull.' },
  { kind: 'bigTriple', label: 'Triple 15+', description: 'Triplă pe un segment mare, între 15 și 20.' },
  { kind: 'bigDouble', label: 'Double 15+', description: 'Dublă pe un segment mare, între 15 și 20.' },
  { kind: 'overAvg', label: 'Peste Medie', description: 'Tura a depășit media live a jucătorului.' },
  { kind: 'ton140', label: '140+', description: 'Total tură între 140 și 179.' },
  { kind: 'ton100', label: '100+', description: 'Total tură între 100 și 139.' },
  { kind: 'lowTriple', label: 'Triplă Mică', description: 'Triplă pe un segment mic, până la 5.' },
  { kind: 'threeMisses', label: 'Trei Ratate', description: 'Toate cele trei săgeți au marcat zero în tură.' },
  { kind: 'bust', label: 'Bust', description: 'Tura depășește scorul sau încalcă regulile double-out.' },
  { kind: 'beatGeneral', label: 'Peste Media Generală', description: 'Media din meci a depășit media generală anterioară a jucătorului.' },
  { kind: 'nineDarter', label: 'Nine-Darter', description: '501 terminat în exact nouă săgeți. Oprești muzica.' },
  { kind: 'motown', label: 'Motown', description: 'Finish pe exact 44 — simplu 4 și dublă 20.' },
  { kind: 'champagneShower', label: 'Champagne Shower', description: 'Bust cu 50 sau mai puțin rămas. Erai la o săgeată de câștigarea manșei.' },
  { kind: 'circleIt', label: 'Circle It', description: 'Toate săgețile pe tablă, total tură sub 10. Un peștișor în foișor.' },
  { kind: 'route66', label: 'Route 66', description: 'Total tură exact 66. Drumul legendar al tablei.' },
  { kind: 'allTheFives', label: 'All the Fives', description: 'Total tură exact 55. Cinciuri. Doar cinciuri. Cinciuri peste tot.' },
  { kind: 'twoFatLadies', label: 'Two Fat Ladies', description: 'Total tură exact 88. Cele două doamne grase pe tablă.' },
];

export const CELEBRATION_CATALOG = [
  // Hall of Fame — great shots worth celebrating
  { kind: '180', label: '180 — Maximum', subtitle: 'MAXIMUM!', description: 'Three treble 20s. The holy trinity. Tell your grandchildren.', group: 'hallOfFame', awardsBadge: true },
  { kind: 'highFinish', label: 'High Finish', subtitle: 'FINALIZARE ÎNALTĂ!', description: 'Checkout of 100 or more. You actually planned this.', group: 'hallOfFame', awardsBadge: true },
  { kind: 'bullFinish', label: 'Champagne Finish', subtitle: 'FINALIZARE BULL!', description: 'Won the leg on the double bullseye. Pop the fizzy water.', group: 'hallOfFame', awardsBadge: true },
  { kind: 'ton140', label: '140+', subtitle: 'MAGNIFIC!', description: 'Scored 140 to 179 in one visit. One step from the max.', group: 'hallOfFame', awardsBadge: true },
  { kind: 'bigTriple', label: 'Triple 15+', subtitle: 'TRIPLĂ GREA!', description: 'Hit the triple ring on a high segment (15–20). Precision.', group: 'hallOfFame', awardsBadge: true },
  { kind: 'bigDouble', label: 'Double 15+', subtitle: 'DUBLĂ GREA!', description: 'Hit the double ring on a high segment (15–20). Clutch.', group: 'hallOfFame', awardsBadge: true },
  { kind: 'shanghai', label: 'Shanghai', subtitle: 'SHANGHAI!', description: 'Single, double and triple on the same number in one visit. Sorcery.', group: 'hallOfFame', awardsBadge: true },
  { kind: 'blackHat', label: 'Black Hat', subtitle: 'BLACK HAT!', description: 'Three double-bulls in one visit. The board is scared of you.', group: 'hallOfFame', awardsBadge: true },
  { kind: 'bailOut', label: 'Bail Out', subtitle: 'BAIL OUT!', description: 'First two darts were weak. Last dart saved the turn. Hero.', group: 'hallOfFame', awardsBadge: true },
  { kind: 'madhouseEscape', label: 'Madhouse Escape', subtitle: 'MADHOUSE ESCAPE!', description: 'Checkout on double 1. You faced the madhouse and survived.', group: 'hallOfFame', awardsBadge: true },

  // Score Callouts — named scores from pub darts culture
  { kind: 'ton100', label: 'Ton — 100+', subtitle: 'CLUB 100+!', description: 'Three figures in a garage. Genuinely cause for celebration.', group: 'scoreCallout', awardsBadge: true },
  { kind: 'breakfast', label: 'Bed and Breakfast', subtitle: 'MIC DEJUN ENGLEZESC!', description: 'Single 1, 5 and 20 in one visit — exactly 26. Classic pub disappointment.', group: 'scoreCallout', awardsBadge: true },
  { kind: 'overAvg', label: 'Over Average', subtitle: 'PESTE MEDIA TA!', description: 'This visit beat your own live average. Keep it up.', group: 'scoreCallout', awardsBadge: false },
  { kind: 'centrul', label: 'Centrul', subtitle: 'DAR NU ERA MOMENTUL...', description: 'Hit the bull — but not as the finishing dart. So close, so useless.', group: 'scoreCallout', awardsBadge: true },
  { kind: 'lunetist', label: 'Lunetist', subtitle: 'LUNETISTUL CONFUZ!', description: 'Triple 1. Incredible precision. Catastrophic target choice.', group: 'scoreCallout', awardsBadge: true },

  // Hall of Shame — disasters that must be witnessed by all
  { kind: 'bust', label: 'Bust', subtitle: 'PREA MULT!', description: 'Scored over the finish. Score resets. Pride does not.', group: 'hallOfShame', awardsBadge: true },
  { kind: 'threeMisses', label: 'Three Misses', subtitle: 'TREI RATATE!', description: 'All three darts scored zero. Impressive in the worst way.', group: 'hallOfShame', awardsBadge: true },
  { kind: 'lowTriple', label: 'Low Triple', subtitle: 'CEL PUȚIN L-AI NIMERIT!', description: 'Triple on a low number (1–5). You hit the treble. On the 1.', group: 'hallOfShame', awardsBadge: true },
  { kind: 'bucket', label: 'Bag of Nails', subtitle: 'BUCKET OF NAILS!', description: 'Three single 1s in a round. The worst three darts legally possible.', group: 'hallOfShame', awardsBadge: true },
  { kind: 'zugrav', label: 'Zugrav', subtitle: 'SE CAUTĂ MESERIAȘ!', description: 'Missed the board entirely. The board has rejected you. Personally.', group: 'hallOfShame', awardsBadge: true },
  { kind: 'hamster', label: 'Hamster', subtitle: 'EFORT MAXIM, REZULTAT MINIM!', description: 'All darts on the board, turn total still under 20. Maximum effort, minimum result.', group: 'hallOfShame', awardsBadge: true },
  { kind: 'matematician', label: 'Matematician', subtitle: 'CALCUL GREȘIT!', description: 'Bust from a very small remaining score. You were so close.', group: 'hallOfShame', awardsBadge: true },

  // Ceremony — match moments and milestones
  { kind: 'legWon', label: 'Leg Won', subtitle: 'MANȘĂ CÂȘTIGATĂ!', description: 'A leg is done. The board bows.', group: 'ceremony', awardsBadge: false },
  { kind: 'beatGeneral', label: 'Beat General Avg', subtitle: 'PESTE MEDIA GENERALĂ!', description: 'Match average finished above your all-time average. You are getting better.', group: 'ceremony', awardsBadge: true },

  // Hall of Fame — new additions
  { kind: 'nineDarter', label: 'Nine-Darter', subtitle: 'NINE-DARTER!', description: '501 finished in exactly nine darts. Stop the music. Tell your grandchildren.', group: 'hallOfFame', awardsBadge: true },
  { kind: 'motown', label: 'Motown', subtitle: 'FOUR TOPS!', description: 'Checkout on exactly 44. Single 4, double 20. Moonwalk back from the oche.', group: 'hallOfFame', awardsBadge: true },

  // Score Callouts — new additions
  { kind: 'route66', label: 'Route 66', subtitle: 'GET YOUR KICKS!', description: 'Turn total of exactly 66. Get your kicks on the dartboard.', group: 'scoreCallout', awardsBadge: true },
  { kind: 'allTheFives', label: 'All the Fives', subtitle: 'ALL THE FIVES!', description: 'Turn total of exactly 55. Fives. Just fives. Fives everywhere.', group: 'scoreCallout', awardsBadge: true },
  { kind: 'twoFatLadies', label: 'Two Fat Ladies', subtitle: 'TWO FAT LADIES!', description: 'Turn total of exactly 88. The eights waddle onto the board together.', group: 'scoreCallout', awardsBadge: true },

  // Hall of Shame — new additions
  { kind: 'champagneShower', label: 'Champagne Shower', subtitle: 'ATÂT DE APROAPE...', description: 'Bust when 50 or under remaining. You were one dart from winning the leg.', group: 'hallOfShame', awardsBadge: true },
  { kind: 'circleIt', label: 'Circle It', subtitle: 'CERCUIEȘTE!', description: 'All darts on the board, total still under 10. In the pub someone draws a fish around this score.', group: 'hallOfShame', awardsBadge: true },
];

export const EXPERIMENTAL_CELEBRATION_IDEAS = [
  // Hall of Fame proposals
  {
    kind: 'robinHood',
    label: 'Robin Hood',
    category: 'hallOfFame',
    status: 'manual-only',
    description: 'One dart lands inside the shaft or flight of another dart already in the board. Cannot be detected from score input alone — needs physical dart telemetry.',
  },
  {
    kind: 'threeInABed',
    label: 'Three in a Bed',
    category: 'hallOfFame',
    status: 'needs-per-dart-data',
    description: 'All three darts land in the same segment. Not detectable from turn total alone — needs per-dart segment tracking.',
  },

  // Score Callout proposals
  {
    kind: 'heinz',
    label: 'Heinz',
    category: 'scoreCallout',
    status: 'feasible',
    description: 'Turn total of exactly 57 — Heinz 57 Varieties. Congratulations, you are ketchup.',
  },
  {
    kind: 'sunsetStrip',
    label: 'Sunset Strip',
    category: 'scoreCallout',
    status: 'feasible',
    description: 'Turn total of exactly 77. Cool name for a very mid score.',
  },
  {
    kind: 'trombones',
    label: 'Trombones',
    category: 'scoreCallout',
    status: 'feasible',
    description: 'Turn total of exactly 76. Seventy-six trombones led the big parade — and all of them missed treble 20.',
  },

  // Hall of Shame proposals
  {
    kind: 'rightChurchWrongPew',
    label: 'Right Church, Wrong Pew',
    category: 'hallOfShame',
    status: 'needs-per-dart-data',
    description: 'Hit the right ring (double or triple) but the wrong number. Also known as Daddy\'s Bed. Needs per-dart segment tracking to detect.',
  },

  // Ceremony proposals
  {
    kind: 'wetFeet',
    label: 'Wet Feet',
    category: 'ceremony',
    status: 'manual-only',
    description: 'Stepping over or across the oche while throwing. Cannot be detected without a floor sensor or camera. Call it manually and enjoy the argument.',
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

export function preferredBadgeAssetFile(files = []) {
  if (!files.length) return null;

  return [...files].sort((a, b) => {
    const extA = extname(a).toLowerCase();
    const extB = extname(b).toLowerCase();
    const idxA = BADGE_ASSET_EXTENSION_PRIORITY.indexOf(extA);
    const idxB = BADGE_ASSET_EXTENSION_PRIORITY.indexOf(extB);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB) || a.localeCompare(b);
  })[0];
}
