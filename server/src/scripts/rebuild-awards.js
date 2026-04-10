import { openDb } from '../db/connection.js';
import { submitDart, newLeg } from '../engine/x01.js';

function detectFunnyCelebration(segment, multiplier, scoreValue, isBust, dartInTurn, prevTurnDarts, turnStartRemaining, isFinished, playerTurnAverage = null) {
  if (isBust && turnStartRemaining <= 20) return 'matematician';
  if (!isBust && isFinished && segment === 1 && multiplier === 2) return 'madhouseEscape';
  if (segment === 1 && multiplier === 3 && !isBust) return 'lunetist';
  if (segment === 0) return 'zugrav';

  if (dartInTurn === 3 && !isBust) {
    const fullTurn = [...prevTurnDarts, { segment, multiplier, score_value: scoreValue }];
    const total = fullTurn.reduce((sum, dart) => sum + dart.score_value, 0);
    const segs = fullTurn.map((dart) => dart.segment).sort((a, b) => a - b);
    const mults = fullTurn.map((dart) => dart.multiplier);
    const bulls = fullTurn.filter((dart) => dart.segment === 25 && dart.multiplier === 2).length;
    const hasSpecialShotInTurn = fullTurn.some((dart) =>
      dart.segment === 0
      || (dart.segment === 1 && dart.multiplier === 3)
      || (dart.segment === 25 && dart.multiplier === 2)
      || (dart.segment >= 15 && (dart.multiplier === 2 || dart.multiplier === 3))
    );

    if (bulls === 3) return 'blackHat';

    const shanghaiNumber = fullTurn[0]?.segment;
    if (
      shanghaiNumber != null
      && shanghaiNumber !== 0
      && shanghaiNumber !== 25
      && fullTurn.every((dart) => dart.segment === shanghaiNumber)
      && mults.includes(1) && mults.includes(2) && mults.includes(3)
    ) return 'shanghai';

    if (segs[0] === 1 && segs[1] === 5 && segs[2] === 20 && mults.every((value) => value === 1)) return 'breakfast';

    const firstTwoTotal = fullTurn.slice(0, 2).reduce((sum, dart) => sum + dart.score_value, 0);
    const thirdDart = fullTurn[2];
    if (thirdDart && firstTwoTotal <= 20 && thirdDart.score_value >= 40) return 'bailOut';

    const distinctSegments = new Set(fullTurn.map((dart) => dart.segment)).size;
    const distinctMultipliers = new Set(mults).size;
    if (distinctSegments === 3 && distinctMultipliers >= 2 && total >= 21 && total <= 60) return 'bucket';

    if (total > 0 && total < 20 && fullTurn.every((dart) => dart.segment > 0)) return 'hamster';

    if (!hasSpecialShotInTurn && playerTurnAverage != null && total > playerTurnAverage) return 'overAvg';
  }

  if (segment === 25 && multiplier === 2 && !isFinished && !isBust) return 'centrul';

  if (!isBust && segment >= 15) {
    if (multiplier === 3) return 'bigTriple';
    if (multiplier === 2) return 'bigDouble';
  }

  return null;
}

function currentPlayerTurnAverage(dartRows, playerId) {
  const turnTotals = new Map();

  for (const row of dartRows) {
    if (row.player_id !== playerId) continue;
    const key = `${row.leg_id}:${row.turn_number}`;
    const previous = turnTotals.get(key) ?? { total: 0, busted: false };
    previous.total += row.busted ? 0 : (row.score_value ?? 0);
    previous.busted = previous.busted || row.busted === 1;
    turnTotals.set(key, previous);
  }

  const totals = [...turnTotals.values()].map((turn) => (turn.busted ? 0 : turn.total));
  if (totals.length === 0) return null;
  return totals.reduce((sum, total) => sum + total, 0) / totals.length;
}

function matchAverageFromRows(rows, playerId) {
  const playerRows = rows.filter((row) => row.player_id === playerId);
  if (!playerRows.length) return 0;
  const score = playerRows.reduce((sum, row) => sum + (row.busted ? 0 : row.score_value), 0);
  return Number((((score * 3) / playerRows.length)).toFixed(2));
}

const db = openDb();

const matches = db.prepare(`
  SELECT DISTINCT m.id, m.starting_score, m.double_out, m.status, m.created_at, m.started_at, m.ended_at
  FROM matches m
  JOIN legs l ON l.match_id = m.id
  JOIN darts d ON d.leg_id = l.id
  ORDER BY COALESCE(m.ended_at, m.started_at, m.created_at) ASC, m.id ASC
`).all();

const historyByPlayer = new Map();
const summary = {
  matchesProcessed: matches.length,
  awardsInserted: 0,
  byKind: {},
  warnings: [],
};

function noteAward(kind) {
  summary.awardsInserted += 1;
  summary.byKind[kind] = (summary.byKind[kind] ?? 0) + 1;
}

const rebuildAwards = db.transaction(() => {
  db.prepare('DELETE FROM awards').run();

  for (const match of matches) {
    const players = db.prepare(`
      SELECT player_id
      FROM match_players
      WHERE match_id = ?
      ORDER BY position
    `).all(match.id).map((row) => row.player_id);

    const legs = db.prepare(`
      SELECT id, starting_id
      FROM legs
      WHERE match_id = ?
      ORDER BY leg_number ASC, id ASC
    `).all(match.id);

    const matchDarts = db.prepare(`
      SELECT d.id, d.leg_id, d.player_id, d.turn_number, d.dart_in_turn, d.segment, d.multiplier, d.score_value, d.busted
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      WHERE l.match_id = ?
      ORDER BY d.id ASC
    `).all(match.id);

    for (const leg of legs) {
      const legRows = matchDarts.filter((row) => row.leg_id === leg.id);
      const startingPlayerId = players.includes(leg.starting_id) ? leg.starting_id : players[0];

      if (startingPlayerId !== leg.starting_id) {
        summary.warnings.push(
          `match ${match.id}, leg ${leg.id}: starting_id ${leg.starting_id} missing from match_players; fallback to ${startingPlayerId}`
        );
      }

      let state = newLeg({
        startingScore: match.starting_score,
        doubleOut: match.double_out === 1,
        players,
        startingPlayerId,
      });
      const priorLegRows = [];

      for (const row of legRows) {
        const prevPlayerIdx = state.leg.currentPlayerIdx;
        const prevTurnLen = state.leg.turn.length;
        const prevTurnDarts = state.leg.turn;
        const turnStartRemaining = state.leg.turnStartRemaining;
        const currentPlayerId = state.players[prevPlayerIdx];

        const nextState = submitDart(state, { segment: row.segment, multiplier: row.multiplier });
        const isBust = nextState.leg.turn.some((dart) => dart.busted)
          || (nextState.leg.currentPlayerIdx !== prevPlayerIdx && prevTurnLen + 1 < 3 && !nextState.leg.finished);
        const playerTurnAverage = currentPlayerTurnAverage(priorLegRows, currentPlayerId);
        const funnyCelebration = detectFunnyCelebration(
          row.segment,
          row.multiplier,
          row.score_value,
          isBust,
          prevTurnLen + 1,
          prevTurnDarts,
          turnStartRemaining,
          nextState.leg.finished,
          playerTurnAverage
        );
        const celebrationKind = funnyCelebration ?? nextState.celebration;
        const fullTurn = [...prevTurnDarts, { segment: row.segment, multiplier: row.multiplier, score_value: row.score_value }];
        const fullTurnTotal = fullTurn.reduce((sum, dart) => sum + dart.score_value, 0);

        if (celebrationKind && celebrationKind !== 'overAvg') {
          db.prepare(`
            INSERT OR IGNORE INTO awards (match_id, leg_id, dart_id, player_id, kind, value)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(match.id, row.leg_id, row.id, row.player_id, celebrationKind, fullTurnTotal);
          noteAward(celebrationKind);
        }

        priorLegRows.push(row);
        state = nextState;
      }
    }

    if (match.status === 'finished') {
      for (const playerId of players) {
        const previous = historyByPlayer.get(playerId) ?? { score: 0, darts: 0 };
        const previousAvg = previous.darts > 0 ? Number((((previous.score * 3) / previous.darts)).toFixed(2)) : 0;
        const currentMatchAvg = matchAverageFromRows(matchDarts, playerId);

        if (previousAvg > 0 && currentMatchAvg > previousAvg) {
          const lastDart = [...matchDarts].reverse().find((row) => row.player_id === playerId);
          if (lastDart) {
            db.prepare(`
              INSERT OR IGNORE INTO awards (match_id, leg_id, dart_id, player_id, kind, value)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(match.id, lastDart.leg_id, lastDart.id, playerId, 'beatGeneral', Math.round(currentMatchAvg));
            noteAward('beatGeneral');
          }
        }
      }

      for (const playerId of players) {
        const rows = matchDarts.filter((row) => row.player_id === playerId);
        const previous = historyByPlayer.get(playerId) ?? { score: 0, darts: 0 };
        previous.score += rows.reduce((sum, row) => sum + (row.busted ? 0 : row.score_value), 0);
        previous.darts += rows.length;
        historyByPlayer.set(playerId, previous);
      }
    }
  }
});

rebuildAwards();
console.log(JSON.stringify(summary, null, 2));
