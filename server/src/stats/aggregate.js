import { getDb } from '../db/connection.js';

/**
 * Lifetime stats for a single player.
 */
export function playerStats(playerId) {
  const db = getDb();

  const avg = db.prepare(`
    SELECT ROUND(AVG(turn_total) * 1.0, 2) AS avg_3dart
    FROM (
      SELECT turn_number, SUM(score_value) AS turn_total
      FROM darts
      WHERE player_id = ? AND busted = 0
      GROUP BY leg_id, turn_number
    )
  `).get(playerId);

  const totals = db.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN winner_id = ? THEN id END) AS legs_won,
      COUNT(DISTINCT id) AS legs_played
    FROM legs
    WHERE id IN (SELECT leg_id FROM darts WHERE player_id = ?)
  `).get(playerId, playerId);

  const s180 = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT leg_id, turn_number
      FROM darts
      WHERE player_id = ?
      GROUP BY leg_id, turn_number
      HAVING SUM(score_value) = 180 AND COUNT(*) = 3
    )
  `).get(playerId);

  const s140plus = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT leg_id, turn_number
      FROM darts
      WHERE player_id = ?
      GROUP BY leg_id, turn_number
      HAVING SUM(score_value) >= 140
    )
  `).get(playerId);

  const s100plus = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT leg_id, turn_number
      FROM darts
      WHERE player_id = ?
      GROUP BY leg_id, turn_number
      HAVING SUM(score_value) >= 100
    )
  `).get(playerId);

  const highFinish = db.prepare(`
    SELECT MAX(turn_total) AS value
    FROM (
      SELECT leg_id, turn_number, SUM(score_value) AS turn_total
      FROM darts
      WHERE player_id = ?
      GROUP BY leg_id, turn_number
    ) t
    WHERE EXISTS (
      SELECT 1 FROM legs l
      WHERE l.id = t.leg_id AND l.winner_id = ?
    )
    AND turn_total >= 2
  `).get(playerId, playerId);

  const first9 = db.prepare(`
    SELECT ROUND(AVG(turn_total) * 1.0, 2) AS avg
    FROM (
      SELECT turn_number, SUM(score_value) AS turn_total
      FROM darts
      WHERE player_id = ? AND busted = 0
      GROUP BY leg_id, turn_number
      HAVING turn_number <= 3
    )
  `).get(playerId);

  const checkoutPct = totals.legs_played > 0
    ? Math.round((totals.legs_won / totals.legs_played) * 1000) / 10
    : 0;

  return {
    player_id:    playerId,
    avg_3dart:    avg?.avg_3dart ?? 0,
    avg_first9:   first9?.avg ?? 0,
    checkout_pct: checkoutPct,
    legs_won:     totals?.legs_won ?? 0,
    legs_played:  totals?.legs_played ?? 0,
    s180:         s180?.count ?? 0,
    s140plus:     s140plus?.count ?? 0,
    s100plus:     s100plus?.count ?? 0,
    high_finish:  highFinish?.value ?? 0,
  };
}

/**
 * Per-match stats for all players.
 */
export function matchStats(matchId) {
  const db = getDb();

  const players = db.prepare(
    'SELECT player_id FROM match_players WHERE match_id = ? ORDER BY position'
  ).all(matchId).map((r) => r.player_id);

  return players.map((playerId) => {
    const avg = db.prepare(`
      SELECT ROUND(AVG(turn_total) * 1.0, 2) AS avg_3dart
      FROM (
        SELECT d.turn_number, SUM(d.score_value) AS turn_total
        FROM darts d
        JOIN legs l ON l.id = d.leg_id
        WHERE l.match_id = ? AND d.player_id = ? AND d.busted = 0
        GROUP BY d.leg_id, d.turn_number
      )
    `).get(matchId, playerId);

    const s180 = db.prepare(`
      SELECT COUNT(*) AS count
      FROM (
        SELECT d.leg_id, d.turn_number
        FROM darts d
        JOIN legs l ON l.id = d.leg_id
        WHERE l.match_id = ? AND d.player_id = ?
        GROUP BY d.leg_id, d.turn_number
        HAVING SUM(d.score_value) = 180 AND COUNT(*) = 3
      )
    `).get(matchId, playerId);

    const legsWon = db.prepare(`
      SELECT COUNT(*) AS count FROM legs WHERE match_id = ? AND winner_id = ?
    `).get(matchId, playerId);

    return {
      player_id: playerId,
      avg_3dart: avg?.avg_3dart ?? 0,
      s180:      s180?.count ?? 0,
      legs_won:  legsWon?.count ?? 0,
    };
  });
}

/**
 * All data needed for the TV lobby screen in one query batch.
 */
export function lobbyData() {
  const db = getDb();

  // Top 5 players by avg
  const top = db.prepare(`
    SELECT p.id, p.name, p.color, p.photo,
      ROUND(AVG(turn_total) * 1.0, 2) AS avg_3dart,
      SUM(CASE WHEN turn_total = 180 THEN 1 ELSE 0 END) AS s180,
      COUNT(DISTINCT CASE WHEN l.winner_id = p.id THEN l.id END) AS legs_won
    FROM (
      SELECT d.player_id, d.leg_id, d.turn_number, SUM(d.score_value) AS turn_total
      FROM darts d WHERE d.busted = 0
      GROUP BY d.player_id, d.leg_id, d.turn_number
    ) t
    JOIN players p ON p.id = t.player_id
    JOIN legs l ON l.id = t.leg_id
    WHERE p.archived_at IS NULL
    GROUP BY p.id ORDER BY avg_3dart DESC LIMIT 5
  `).all();

  // Last 5 finished matches with winner info
  const recentMatches = db.prepare(`
    SELECT m.id, m.starting_score, m.ended_at, m.winner_id
    FROM matches m WHERE m.status = 'finished'
    ORDER BY m.ended_at DESC LIMIT 5
  `).all().map(m => {
    const players = db.prepare(`
      SELECT p.id, p.name, p.color, mp.legs_won
      FROM match_players mp JOIN players p ON p.id = mp.player_id
      WHERE mp.match_id = ? ORDER BY mp.position
    `).all(m.id);
    return { ...m, players };
  });

  // Fun facts
  const highFinish = db.prepare(`
    SELECT p.name, p.color, MAX(turn_total) AS value
    FROM (
      SELECT d.player_id, d.leg_id, d.turn_number, SUM(d.score_value) AS turn_total
      FROM darts d GROUP BY d.player_id, d.leg_id, d.turn_number
    ) t
    JOIN legs l ON l.id = t.leg_id AND l.winner_id = t.player_id
    JOIN players p ON p.id = t.player_id
    WHERE turn_total >= 2
  `).get();

  const most180 = db.prepare(`
    SELECT p.name, p.color, COUNT(*) AS count
    FROM (
      SELECT d.player_id, d.leg_id, d.turn_number
      FROM darts d WHERE d.busted = 0
      GROUP BY d.player_id, d.leg_id, d.turn_number
      HAVING SUM(d.score_value) = 180 AND COUNT(*) = 3
    ) t
    JOIN players p ON p.id = t.player_id
    GROUP BY t.player_id ORDER BY count DESC LIMIT 1
  `).get();

  const totalDarts = db.prepare(`SELECT COUNT(*) AS c FROM darts`).get();
  const totalMatches = db.prepare(`SELECT COUNT(*) AS c FROM matches WHERE status = 'finished'`).get();

  // Best single-match average
  const bestMatchAvg = db.prepare(`
    SELECT p.name, p.color,
      ROUND(AVG(turn_total) * 1.0, 2) AS avg
    FROM (
      SELECT d.player_id, d.leg_id, d.turn_number, l.match_id,
        SUM(d.score_value) AS turn_total
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      WHERE d.busted = 0
      GROUP BY d.player_id, l.match_id, d.leg_id, d.turn_number
    ) t
    JOIN players p ON p.id = t.player_id
    WHERE p.archived_at IS NULL
    GROUP BY t.player_id, t.match_id
    ORDER BY avg DESC LIMIT 1
  `).get();

  // Recent turns scoring 100+
  const recentHundredPlus = db.prepare(`
    SELECT p.name AS player_name, p.color,
      SUM(d.score_value) AS value,
      l.started_at AS date,
      l.match_id
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    JOIN players p ON p.id = d.player_id
    WHERE d.busted = 0
    GROUP BY d.player_id, d.leg_id, d.turn_number
    HAVING value >= 100
    ORDER BY l.id DESC, d.turn_number DESC
    LIMIT 5
  `).all().map(row => {
    const opponents = db.prepare(`
      SELECT p2.name FROM match_players mp
      JOIN players p2 ON p2.id = mp.player_id
      WHERE mp.match_id = ? AND p2.name != ?
    `).all(row.match_id, row.player_name).map(r => r.name);
    return { ...row, opponents };
  });

  // Player win rates (min 2 matches played)
  const playerWinRates = db.prepare(`
    SELECT p.name, p.color,
      COUNT(DISTINCT m.id) AS played,
      COUNT(DISTINCT CASE WHEN m.winner_id = p.id THEN m.id END) AS wins
    FROM players p
    JOIN match_players mp ON mp.player_id = p.id
    JOIN matches m ON m.id = mp.match_id AND m.status = 'finished'
    WHERE p.archived_at IS NULL
    GROUP BY p.id
    HAVING played >= 2
    ORDER BY wins * 1.0 / played DESC
  `).all().map(r => ({
    name: r.name,
    color: r.color,
    wins: r.wins,
    played: r.played,
    pct: Math.round((r.wins / r.played) * 100),
  }));

  // Longest consecutive leg win streak
  const allLegs = db.prepare(`
    SELECT l.id, l.winner_id, p.name, p.color
    FROM legs l
    JOIN players p ON p.id = l.winner_id
    WHERE l.winner_id IS NOT NULL
    ORDER BY l.id ASC
  `).all();

  let longestStreak = null;
  if (allLegs.length > 0) {
    let best = { name: allLegs[0].name, color: allLegs[0].color, count: 1 };
    let cur  = { name: allLegs[0].name, color: allLegs[0].color, count: 1 };
    for (let i = 1; i < allLegs.length; i++) {
      if (allLegs[i].winner_id === allLegs[i - 1].winner_id) {
        cur.count++;
        if (cur.count > best.count) best = { ...cur };
      } else {
        cur = { name: allLegs[i].name, color: allLegs[i].color, count: 1 };
      }
    }
    longestStreak = best;
  }

  // Player with most 100+ turns
  const most100plus = db.prepare(`
    SELECT p.name, p.color, COUNT(*) AS count
    FROM (
      SELECT d.player_id, d.leg_id, d.turn_number
      FROM darts d WHERE d.busted = 0
      GROUP BY d.player_id, d.leg_id, d.turn_number
      HAVING SUM(d.score_value) >= 100
    ) t
    JOIN players p ON p.id = t.player_id
    GROUP BY t.player_id ORDER BY count DESC LIMIT 1
  `).get();

  // Player with most high triples (T15–T20)
  const mostHighTriples = db.prepare(`
    SELECT p.name, p.color, COUNT(*) AS count
    FROM darts d
    JOIN players p ON p.id = d.player_id
    WHERE d.multiplier = 3 AND d.segment >= 15 AND d.busted = 0
    GROUP BY d.player_id ORDER BY count DESC LIMIT 1
  `).get();

  // Full leaderboard of high triples (T15–T20) per player
  const highTriplesLeaderboard = db.prepare(`
    SELECT p.name, p.color, p.photo, COUNT(*) AS count
    FROM darts d
    JOIN players p ON p.id = d.player_id
    WHERE d.multiplier = 3 AND d.segment >= 15 AND d.busted = 0
      AND p.archived_at IS NULL
    GROUP BY d.player_id
    ORDER BY count DESC
  `).all();

  // Full leaderboard of 100+ turns per player
  const hundredPlusLeaderboard = db.prepare(`
    SELECT p.name, p.color, p.photo, COUNT(*) AS count
    FROM (
      SELECT d.player_id, d.leg_id, d.turn_number
      FROM darts d WHERE d.busted = 0
      GROUP BY d.player_id, d.leg_id, d.turn_number
      HAVING SUM(d.score_value) >= 100
    ) t
    JOIN players p ON p.id = t.player_id
    WHERE p.archived_at IS NULL
    GROUP BY t.player_id
    ORDER BY count DESC
  `).all();

  return {
    top, recentMatches, highFinish, most180,
    totalDarts: totalDarts?.c ?? 0,
    totalMatches: totalMatches?.c ?? 0,
    bestMatchAvg: bestMatchAvg ?? null,
    recentHundredPlus,
    playerWinRates,
    longestStreak,
    most100plus: most100plus ?? null,
    mostHighTriples: mostHighTriples ?? null,
    highTriplesLeaderboard,
    hundredPlusLeaderboard,
  };
}

/**
 * Leaderboard — top players ranked by 3-dart average.
 */
export function leaderboard(limit = 10) {
  const db = getDb();

  return db.prepare(`
    SELECT
      p.id, p.name, p.nickname, p.color,
      ROUND(AVG(turn_total) * 1.0, 2) AS avg_3dart,
      SUM(CASE WHEN turn_total = 180 THEN 1 ELSE 0 END) AS s180
    FROM (
      SELECT d.player_id, d.leg_id, d.turn_number, SUM(d.score_value) AS turn_total
      FROM darts d
      WHERE d.busted = 0
      GROUP BY d.player_id, d.leg_id, d.turn_number
    ) t
    JOIN players p ON p.id = t.player_id
    WHERE p.archived_at IS NULL
    GROUP BY p.id
    ORDER BY avg_3dart DESC
    LIMIT ?
  `).all(limit);
}
