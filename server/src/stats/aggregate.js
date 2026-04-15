import { getDb } from '../db/connection.js';
import { AWARD_PRIORITY, BADGE_CATALOG, sortBadgesByPriority } from '../catalog.js';
import { rebuildFromEvents } from '../engine/x01.js';
import { officialThreeDartAverageExpr } from './averages.js';

// ── Lobby data cache (55s TTL — TV refreshes every 60s) ──────────────────────
let _lobbyCache = null;
let _lobbyCacheAt = 0;
const LOBBY_CACHE_TTL = 10 * 60_000; // 10 minute — refresh less often to avoid blocking event loop

export function invalidateLobbyCache() {
  _lobbyCache = null;
  _lobbyCacheAt = 0;
}

function finishedMatchClause(alias = 'm') {
  return `${alias}.status = 'finished'`;
}

function liveAwareMatchClause(alias = 'm', includeLive = false) {
  return includeLive
    ? `${alias}.status IN ('finished', 'live')`
    : finishedMatchClause(alias);
}

function visiblePlayerClause(alias = 'p') {
  return `${alias}.archived_at IS NULL AND ${alias}.stats_visible = 1`;
}

function topHitValuesForPlayer(db, playerId, limit = 5) {
  return db.prepare(`
    SELECT
      d.segment,
      d.multiplier,
      d.score_value AS score,
      COUNT(*) AS count
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    JOIN matches m ON m.id = l.match_id
    WHERE d.player_id = ?
      AND d.segment > 0
      AND ${finishedMatchClause('m')}
    GROUP BY d.segment, d.multiplier
    ORDER BY count DESC, score DESC, d.segment DESC
    LIMIT ?
  `).all(playerId, limit).map((row) => ({
    ...row,
    label: dartLabel(row.segment, row.multiplier),
  }));
}

function segmentDistributionForPlayer(db, playerId) {
  const rows = db.prepare(`
    SELECT
      CASE
        WHEN d.segment = 25 THEN 25
        WHEN d.segment = 0 THEN 0
        ELSE d.segment
      END AS segment_bucket,
      COUNT(*) AS count
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    JOIN matches m ON m.id = l.match_id
    WHERE d.player_id = ?
      AND ${finishedMatchClause('m')}
    GROUP BY segment_bucket
  `).all(playerId);

  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);

  return rows
    .map((row) => {
      const segment = Number(row.segment_bucket);
      const count = Number(row.count ?? 0);
      return {
        segment,
        label: segment === 25 ? '25/Bull' : segment === 0 ? 'Miss' : String(segment),
        count,
        pct: total ? Math.round((count / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.segment === 25) return 1;
      if (b.segment === 25) return -1;
      return a.segment - b.segment;
    })
    .slice(0, 10);
}

function awardsForPlayers(db) {
  const rows = db.prepare(`
    SELECT
      a.player_id,
      a.kind,
      COUNT(*) AS count
    FROM awards a
    JOIN matches m ON m.id = a.match_id
    WHERE ${finishedMatchClause('m')}
    GROUP BY a.player_id, a.kind
  `).all();

  const byPlayer = new Map();
  for (const row of rows) {
    if (!byPlayer.has(row.player_id)) byPlayer.set(row.player_id, []);
    byPlayer.get(row.player_id).push({ kind: row.kind, count: row.count });
  }

  for (const [playerId, awards] of byPlayer.entries()) {
    awards.sort((a, b) => {
      const priorityDelta = AWARD_PRIORITY.indexOf(a.kind) - AWARD_PRIORITY.indexOf(b.kind);
      if (priorityDelta !== 0) return priorityDelta;
      return b.count - a.count;
    });
    byPlayer.set(playerId, awards);
  }

  return byPlayer;
}

function checkoutRemainingByPlayer(db, match) {
  if (!match?.id || !match?.starting_score) return new Map();

  const leg = db.prepare(`
    SELECT id, starting_id
    FROM legs
    WHERE match_id = ? AND winner_id IS NOT NULL
    ORDER BY leg_number DESC, id DESC
    LIMIT 1
  `).get(match.id);

  if (!leg) return new Map();

  const players = db.prepare(`
    SELECT player_id
    FROM match_players
    WHERE match_id = ?
    ORDER BY position ASC
  `).all(match.id).map((row) => row.player_id);

  if (!players.length) return new Map();

  const dartRows = db.prepare(`
    SELECT id, player_id, segment, multiplier, score_value, turn_number, dart_in_turn, busted
    FROM darts
    WHERE leg_id = ?
    ORDER BY turn_number ASC, dart_in_turn ASC, id ASC
  `).all(leg.id);

  if (!dartRows.length) return new Map();

  try {
    const state = rebuildFromEvents({
      startingScore: match.starting_score,
      doubleOut: Boolean(match.double_out),
      players,
      startingPlayerId: leg.starting_id ?? players[0],
    }, dartRows);

    return new Map(
      Object.entries(state?.leg?.remaining ?? {}).map(([playerId, remaining]) => [Number(playerId), Number(remaining ?? 0)])
    );
  } catch {
    return new Map();
  }
}

function recentMatchesForPlayer(db, playerId, limit = 5) {
  return db.prepare(`
    SELECT
      m.id,
      m.public_code,
      m.starting_score,
      m.double_out,
      m.created_at,
      m.started_at,
      m.ended_at,
      m.winner_id
    FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.player_id = ?
      AND ${finishedMatchClause('m')}
    ORDER BY COALESCE(m.ended_at, m.started_at, m.created_at) DESC, m.id DESC
    LIMIT ?
  `).all(playerId, limit).map((match) => {
    const remainingByPlayer = checkoutRemainingByPlayer(db, match);
    const participants = db.prepare(`
      SELECT p.id, p.name, p.color, mp.legs_won
      FROM match_players mp
      JOIN players p ON p.id = mp.player_id
      WHERE mp.match_id = ?
      ORDER BY mp.position
    `).all(match.id).map((participant) => ({
      ...participant,
      checkout_remaining: remainingByPlayer.get(participant.id) ?? null,
    }));

    return {
      ...match,
      result: match.winner_id === playerId ? 'win' : 'loss',
      participants,
    };
  });
}

function dartLabel(segment, multiplier) {
  if (segment === 25 && multiplier === 2) return 'BULL';
  if (segment === 25) return '25';
  if (multiplier === 3) return `T${segment}`;
  if (multiplier === 2) return `D${segment}`;
  return `${segment}`;
}

function averageTurnsForPlayer(db, playerId, whereClause, params = []) {
  return db.prepare(`
    SELECT ${officialThreeDartAverageExpr()} AS avg_3dart
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    JOIN matches m ON m.id = l.match_id
    WHERE d.player_id = ? AND ${whereClause}
  `).get(playerId, ...params)?.avg_3dart ?? 0;
}

/**
 * Lifetime stats for a single player.
 * By default, counts only finished matches; `includeLive` lets selected
 * rolling averages account for the current live match too.
 */
export function playerStats(playerId, { includeLive = false } = {}) {
  const db = getDb();

  const avg = db.prepare(`
    SELECT ${officialThreeDartAverageExpr()} AS avg_3dart
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    JOIN matches m ON m.id = l.match_id
    WHERE d.player_id = ? AND ${liveAwareMatchClause('m', includeLive)}
  `).get(playerId);

  const totals = db.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN l.winner_id = ? THEN l.id END) AS legs_won,
      COUNT(DISTINCT l.id) AS legs_played
    FROM legs l
    JOIN matches m ON m.id = l.match_id
    JOIN match_players mp ON mp.match_id = l.match_id
    WHERE mp.player_id = ? AND ${finishedMatchClause('m')}
  `).get(playerId, playerId);

  const s180 = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT d.leg_id, d.turn_number
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE d.player_id = ? AND ${finishedMatchClause('m')}
      GROUP BY d.leg_id, d.turn_number
      HAVING SUM(d.score_value) = 180 AND COUNT(*) = 3
    )
  `).get(playerId);

  const s140plus = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT d.leg_id, d.turn_number
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE d.player_id = ? AND ${finishedMatchClause('m')}
      GROUP BY d.leg_id, d.turn_number
      HAVING SUM(d.score_value) >= 140
    )
  `).get(playerId);

  const s100plus = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT d.leg_id, d.turn_number
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE d.player_id = ? AND ${finishedMatchClause('m')}
      GROUP BY d.leg_id, d.turn_number
      HAVING SUM(d.score_value) >= 100
    )
  `).get(playerId);

  const highRound = db.prepare(`
    SELECT MAX(turn_total) AS value
    FROM (
      SELECT SUM(d.score_value) AS turn_total
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE d.player_id = ? AND d.busted = 0 AND ${finishedMatchClause('m')}
      GROUP BY d.leg_id, d.turn_number
    )
  `).get(playerId);

  const highCheckout = db.prepare(`
    SELECT MAX(t.turn_total) AS value
    FROM (
      SELECT d.leg_id, d.turn_number, SUM(d.score_value) AS turn_total
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE d.player_id = ? AND d.busted = 0 AND ${finishedMatchClause('m')}
      GROUP BY d.leg_id, d.turn_number
    ) t
    JOIN (
      SELECT leg_id, MAX(turn_number) AS last_turn
      FROM darts WHERE player_id = ?
      GROUP BY leg_id
    ) lt ON lt.leg_id = t.leg_id AND lt.last_turn = t.turn_number
    JOIN legs l ON l.id = t.leg_id
    WHERE l.winner_id = ? AND t.turn_total >= 2
  `).get(playerId, playerId, playerId);

  const first9 = db.prepare(`
    SELECT ${officialThreeDartAverageExpr()} AS avg
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    JOIN matches m ON m.id = l.match_id
    WHERE d.player_id = ? AND ${liveAwareMatchClause('m', includeLive)} AND d.turn_number <= 3
  `).get(playerId);

  const matchTotals = db.prepare(`
    SELECT
      COUNT(DISTINCT mp.match_id) AS played,
      COUNT(DISTINCT CASE WHEN m.winner_id = ? THEN m.id END) AS wins
    FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.player_id = ? AND ${finishedMatchClause('m')}
  `).get(playerId, playerId);

  const dartTypes = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN d.multiplier = 3 THEN 1 ELSE 0 END) AS triples,
      SUM(CASE WHEN d.multiplier = 2 THEN 1 ELSE 0 END) AS doubles,
      SUM(CASE WHEN d.multiplier = 1 THEN 1 ELSE 0 END) AS singles
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    JOIN matches m ON m.id = l.match_id
    WHERE d.player_id = ? AND d.busted = 0 AND ${finishedMatchClause('m')}
  `).get(playerId);

  const awards = awardsForPlayers(db).get(playerId) ?? [];

  const checkoutPct = totals.legs_played > 0
    ? Math.round((totals.legs_won / totals.legs_played) * 1000) / 10
    : 0;

  return {
    player_id: playerId,
    avg_3dart: avg?.avg_3dart ?? 0,
    avg_first9: first9?.avg ?? 0,
    checkout_pct: checkoutPct,
    legs_won: totals?.legs_won ?? 0,
    legs_played: totals?.legs_played ?? 0,
    played_matches: matchTotals?.played ?? 0,
    wins: matchTotals?.wins ?? 0,
    s180: s180?.count ?? 0,
    s140plus: s140plus?.count ?? 0,
    s100plus: s100plus?.count ?? 0,
    high_round: highRound?.value ?? 0,
    high_checkout: highCheckout?.value ?? 0,
    dart_total: dartTypes?.total ?? 0,
    pct_triple: dartTypes?.total ? Math.round(dartTypes.triples / dartTypes.total * 1000) / 10 : 0,
    pct_double: dartTypes?.total ? Math.round(dartTypes.doubles / dartTypes.total * 1000) / 10 : 0,
    pct_single: dartTypes?.total ? Math.round(dartTypes.singles / dartTypes.total * 1000) / 10 : 0,
    segment_distribution: segmentDistributionForPlayer(db, playerId),
    top_values: topHitValuesForPlayer(db, playerId),
    awards,
  };
}

export function playerDetail(playerId) {
  const db = getDb();
  const player = db.prepare(`
    SELECT id, name, nickname, color, photo, stats_visible, is_playable, created_at, archived_at
    FROM players
    WHERE id = ?
  `).get(playerId);

  if (!player) return null;

  const stats = playerStats(playerId);

  const awardsByMatch = new Map(
    db.prepare(`
      SELECT match_id, kind, COUNT(*) AS count
      FROM awards
      WHERE player_id = ?
      GROUP BY match_id, kind
      ORDER BY count DESC, kind ASC
    `).all(playerId).reduce((acc, row) => {
      if (!acc.has(row.match_id)) acc.set(row.match_id, []);
      acc.get(row.match_id).push({ kind: row.kind, count: Number(row.count ?? 0) });
      return acc;
    }, new Map())
  );

  const bestFinishByMatch = new Map(
    db.prepare(`
      SELECT l.match_id, MAX(t.turn_total) AS value
      FROM (
        SELECT d.leg_id, d.player_id, d.turn_number, SUM(d.score_value) AS turn_total
        FROM darts d
        WHERE d.busted = 0
        GROUP BY d.leg_id, d.player_id, d.turn_number
      ) t
      JOIN (
        SELECT leg_id, player_id, MAX(turn_number) AS last_turn
        FROM darts
        GROUP BY leg_id, player_id
      ) lt
        ON lt.leg_id = t.leg_id
       AND lt.player_id = t.player_id
       AND lt.last_turn = t.turn_number
      JOIN legs l ON l.id = t.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE t.player_id = ?
        AND l.winner_id = ?
        AND ${finishedMatchClause('m')}
        AND t.turn_total >= 2
      GROUP BY l.match_id
    `).all(playerId, playerId).map((row) => [row.match_id, Number(row.value ?? 0)])
  );

  const matchAvgByMatch = new Map(
    db.prepare(`
      SELECT
        l.match_id,
        ROUND((SUM(CASE WHEN d.busted = 0 THEN d.score_value ELSE 0 END) * 3.0) / NULLIF(COUNT(*), 0), 2) AS avg_3dart
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE d.player_id = ? AND ${finishedMatchClause('m')}
      GROUP BY l.match_id
    `).all(playerId).map((row) => [row.match_id, Number(row.avg_3dart ?? 0)])
  );

  const history = db.prepare(`
    SELECT
      m.id AS match_id,
      m.public_code,
      m.mode,
      m.starting_score,
      m.double_out,
      m.legs_to_win,
      m.created_at,
      m.started_at,
      m.ended_at,
      m.winner_id,
      mp.legs_won AS player_legs_won
    FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.player_id = ? AND ${finishedMatchClause('m')}
    ORDER BY COALESCE(m.ended_at, m.started_at, m.created_at) DESC, m.id DESC
  `).all(playerId).map((match) => {
    const participants = db.prepare(`
      SELECT p.id, p.name, p.nickname, p.color, p.photo, mp.position, mp.legs_won
      FROM match_players mp
      JOIN players p ON p.id = mp.player_id
      WHERE mp.match_id = ?
      ORDER BY mp.position ASC
    `).all(match.match_id);

    return {
      ...match,
      result: match.winner_id === playerId ? 'win' : 'loss',
      match_avg: matchAvgByMatch.get(match.match_id) ?? 0,
      best_finish: bestFinishByMatch.get(match.match_id) ?? 0,
      awards: awardsByMatch.get(match.match_id) ?? [],
      participants,
    };
  });

  const summary = {
    matches: history.length,
    wins: history.filter((match) => match.result === 'win').length,
    losses: history.filter((match) => match.result === 'loss').length,
    latest_match_at: history[0]?.ended_at ?? history[0]?.started_at ?? history[0]?.created_at ?? null,
    awards_total: history.reduce((sum, match) => (
      sum + match.awards.reduce((inner, award) => inner + Number(award.count ?? 0), 0)
    ), 0),
    best_match_avg: history.reduce((best, match) => Math.max(best, Number(match.match_avg ?? 0)), 0),
    best_finish: history.reduce((best, match) => Math.max(best, Number(match.best_finish ?? 0)), 0),
  };

  return {
    player,
    stats,
    summary,
    history,
  };
}

/**
 * Per-match stats for all players.
 */
export function matchStats(matchId) {
  const db = getDb();

  const players = db.prepare(`
    SELECT player_id
    FROM match_players
    WHERE match_id = ?
    ORDER BY position
  `).all(matchId).map((r) => r.player_id);

  return players.map((playerId) => {
    const avg = db.prepare(`
      SELECT ${officialThreeDartAverageExpr()} AS avg_3dart
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      WHERE l.match_id = ? AND d.player_id = ?
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
      SELECT COUNT(*) AS count
      FROM legs
      WHERE match_id = ? AND winner_id = ?
    `).get(matchId, playerId);

    const awards = db.prepare(`
      SELECT kind, COUNT(*) AS count
      FROM awards
      WHERE match_id = ? AND player_id = ?
      GROUP BY kind
      ORDER BY count DESC, kind ASC
    `).all(matchId, playerId);

    return {
      player_id: playerId,
      avg_3dart: avg?.avg_3dart ?? 0,
      s180: s180?.count ?? 0,
      legs_won: legsWon?.count ?? 0,
      awards,
    };
  });
}

export function matchTvRecap(matchId) {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return null;

  const players = db.prepare(`
    SELECT p.*, mp.position, mp.legs_won
    FROM match_players mp
    JOIN players p ON p.id = mp.player_id
    WHERE mp.match_id = ?
    ORDER BY mp.position
  `).all(matchId);

  const matchLevelStats = matchStats(matchId);

  const recapPlayers = players.map((player) => {
    const matchLevel = matchLevelStats.find((item) => item.player_id === player.id) ?? {
      avg_3dart: 0,
      s180: 0,
      legs_won: 0,
      awards: [],
    };
    const currentGeneral = playerStats(player.id);
    const previousGeneral = averageTurnsForPlayer(
      db,
      player.id,
      `${finishedMatchClause('m')} AND m.id != ?`,
      [matchId]
    );

    return {
      id: player.id,
      name: player.name,
      color: player.color,
      photo: player.photo,
      legs_won: matchLevel.legs_won ?? player.legs_won ?? 0,
      match_avg: matchLevel.avg_3dart ?? 0,
      general_avg_before: previousGeneral,
      general_avg_after: currentGeneral.avg_3dart ?? 0,
      avg_delta: previousGeneral ? Number(((currentGeneral.avg_3dart ?? 0) - previousGeneral).toFixed(2)) : 0,
      beat_general: previousGeneral > 0 ? (matchLevel.avg_3dart ?? 0) > previousGeneral : false,
      awards: matchLevel.awards ?? [],
    };
  });

  return {
    match_id: matchId,
    public_code: match.public_code,
    winner_id: match.winner_id,
    starting_score: match.starting_score,
    players: recapPlayers,
  };
}

/**
 * All data needed for the TV lobby screen in one query batch.
 * Lobby stats intentionally count only finished matches.
 */
export function lobbyData() {
  const now = Date.now();
  if (_lobbyCache && (now - _lobbyCacheAt) < LOBBY_CACHE_TTL) {
    return _lobbyCache;
  }

  const db = getDb();
  const awardsByPlayer = awardsForPlayers(db);

  const top = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.nickname,
      p.color,
      p.photo,
      ROUND((SUM(t.scored_points) * 3.0) / NULLIF(SUM(t.darts_thrown), 0), 2) AS avg_3dart,
      SUM(CASE WHEN turn_total = 180 THEN 1 ELSE 0 END) AS s180,
      COUNT(DISTINCT CASE WHEN l.winner_id = p.id THEN l.id END) AS legs_won
    FROM (
      SELECT
        d.player_id,
        d.leg_id,
        d.turn_number,
        SUM(d.score_value) AS turn_total,
        SUM(CASE WHEN d.busted = 0 THEN d.score_value ELSE 0 END) AS scored_points,
        COUNT(*) AS darts_thrown
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE ${finishedMatchClause('m')}
      GROUP BY d.player_id, d.leg_id, d.turn_number
    ) t
    JOIN players p ON p.id = t.player_id
    JOIN legs l ON l.id = t.leg_id
    WHERE ${visiblePlayerClause('p')}
    GROUP BY p.id
    ORDER BY avg_3dart DESC, s180 DESC, p.name ASC
  `).all();

  const recentMatches = db.prepare(`
    SELECT m.id, m.public_code, m.starting_score, m.ended_at, m.winner_id
    FROM matches m
    WHERE ${finishedMatchClause('m')}
    ORDER BY m.ended_at DESC
    LIMIT 5
  `).all().map((m) => {
    const players = db.prepare(`
      SELECT p.id, p.name, p.color, p.photo, mp.legs_won
      FROM match_players mp
      JOIN players p ON p.id = mp.player_id
      WHERE mp.match_id = ?
      ORDER BY mp.position
    `).all(m.id);
    return { ...m, players };
  });

  const highRound = db.prepare(`
    SELECT p.name, p.color, MAX(turn_total) AS value
    FROM (
      SELECT d.player_id, SUM(d.score_value) AS turn_total
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE d.busted = 0 AND ${finishedMatchClause('m')}
      GROUP BY d.player_id, d.leg_id, d.turn_number
    ) t
    JOIN players p ON p.id = t.player_id
    WHERE ${visiblePlayerClause('p')}
  `).get();

  const highCheckout = db.prepare(`
    SELECT p.name, p.color, MAX(t.turn_total) AS value
    FROM (
      SELECT d.player_id, d.leg_id, d.turn_number, SUM(d.score_value) AS turn_total
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE d.busted = 0 AND ${finishedMatchClause('m')}
      GROUP BY d.player_id, d.leg_id, d.turn_number
    ) t
    JOIN (
      SELECT player_id, leg_id, MAX(turn_number) AS last_turn
      FROM darts GROUP BY player_id, leg_id
    ) lt ON lt.player_id = t.player_id AND lt.leg_id = t.leg_id AND lt.last_turn = t.turn_number
    JOIN legs l ON l.id = t.leg_id
    JOIN players p ON p.id = t.player_id
    WHERE l.winner_id = t.player_id AND t.turn_total >= 2
      AND ${visiblePlayerClause('p')}
  `).get();

  const most180 = db.prepare(`
    SELECT p.name, p.color, COUNT(*) AS count
    FROM (
      SELECT d.player_id, d.leg_id, d.turn_number
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE d.busted = 0 AND ${finishedMatchClause('m')}
      GROUP BY d.player_id, d.leg_id, d.turn_number
      HAVING SUM(d.score_value) = 180 AND COUNT(*) = 3
    ) t
    JOIN players p ON p.id = t.player_id
    GROUP BY t.player_id
    ORDER BY count DESC, p.name ASC
    LIMIT 1
  `).get();

  const totalDarts = db.prepare(`
    SELECT COUNT(*) AS c
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    JOIN matches m ON m.id = l.match_id
    WHERE ${finishedMatchClause('m')}
  `).get();

  const totalMatches = db.prepare(`
    SELECT COUNT(*) AS c
    FROM matches m
    WHERE ${finishedMatchClause('m')}
  `).get();

  const bestMatchAvg = db.prepare(`
    SELECT p.name, p.color, p.photo, t.match_id, m.public_code,
      ROUND((SUM(t.scored_points) * 3.0) / NULLIF(SUM(t.darts_thrown), 0), 2) AS avg
    FROM (
      SELECT
        d.player_id,
        d.leg_id,
        d.turn_number,
        l.match_id,
        SUM(d.score_value) AS turn_total,
        SUM(CASE WHEN d.busted = 0 THEN d.score_value ELSE 0 END) AS scored_points,
        COUNT(*) AS darts_thrown
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE ${finishedMatchClause('m')}
      GROUP BY d.player_id, l.match_id, d.leg_id, d.turn_number
    ) t
    JOIN players p ON p.id = t.player_id
    JOIN matches m ON m.id = t.match_id
    WHERE ${visiblePlayerClause('p')}
    GROUP BY t.player_id, t.match_id
    ORDER BY avg DESC, p.name ASC
    LIMIT 1
  `).get();

  const recentHundredPlus = db.prepare(`
    SELECT
      p.name AS player_name,
      p.color,
      p.photo,
      SUM(d.score_value) AS value,
      m.public_code,
      m.ended_at AS date,
      l.match_id
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    JOIN matches m ON m.id = l.match_id
    JOIN players p ON p.id = d.player_id
    WHERE d.busted = 0 AND ${finishedMatchClause('m')} AND ${visiblePlayerClause('p')}
    GROUP BY d.player_id, d.leg_id, d.turn_number
    HAVING value >= 100
    ORDER BY m.ended_at DESC, d.turn_number DESC
    LIMIT 8
  `).all().map((row) => {
    const opponents = db.prepare(`
      SELECT p2.name
      FROM match_players mp
      JOIN players p2 ON p2.id = mp.player_id
      WHERE mp.match_id = ? AND p2.name != ?
    `).all(row.match_id, row.player_name).map((r) => r.name);

    return { ...row, opponents };
  });

  const playerWinRates = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.color,
      p.photo,
      COUNT(DISTINCT m.id) AS played,
      COUNT(DISTINCT CASE WHEN m.winner_id = p.id THEN m.id END) AS wins
    FROM players p
    JOIN match_players mp ON mp.player_id = p.id
    JOIN matches m ON m.id = mp.match_id
    WHERE ${visiblePlayerClause('p')} AND ${finishedMatchClause('m')}
    GROUP BY p.id
    HAVING played >= 2
    ORDER BY wins * 1.0 / played DESC, played DESC, p.name ASC
  `).all().map((r) => ({
    ...r,
    pct: Math.round((r.wins / r.played) * 100),
  }));

  const allLegs = db.prepare(`
    SELECT l.id, l.winner_id, p.name, p.color
    FROM legs l
    JOIN matches m ON m.id = l.match_id
    JOIN players p ON p.id = l.winner_id
    WHERE l.winner_id IS NOT NULL AND ${finishedMatchClause('m')}
    ORDER BY l.id ASC
  `).all();

  let longestStreak = null;
  if (allLegs.length > 0) {
    let best = { name: allLegs[0].name, color: allLegs[0].color, count: 1 };
    let current = { name: allLegs[0].name, color: allLegs[0].color, count: 1 };

    for (let i = 1; i < allLegs.length; i++) {
      if (allLegs[i].winner_id === allLegs[i - 1].winner_id) {
        current.count += 1;
        if (current.count > best.count) best = { ...current };
      } else {
        current = { name: allLegs[i].name, color: allLegs[i].color, count: 1 };
      }
    }

    longestStreak = best;
  }

  const most100plus = db.prepare(`
    SELECT p.name, p.color, COUNT(*) AS count
    FROM (
      SELECT d.player_id, d.leg_id, d.turn_number
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE d.busted = 0 AND ${finishedMatchClause('m')}
      GROUP BY d.player_id, d.leg_id, d.turn_number
      HAVING SUM(d.score_value) >= 100
    ) t
    JOIN players p ON p.id = t.player_id
    GROUP BY t.player_id
    ORDER BY count DESC, p.name ASC
    LIMIT 1
  `).get();

  const highTriplesLeaderboard = db.prepare(`
    SELECT p.id, p.name, p.color, p.photo, COUNT(*) AS count
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    JOIN matches m ON m.id = l.match_id
    JOIN players p ON p.id = d.player_id
    WHERE d.multiplier = 3 AND d.segment BETWEEN 15 AND 20
      AND d.busted = 0
      AND ${visiblePlayerClause('p')}
      AND ${finishedMatchClause('m')}
    GROUP BY d.player_id
    ORDER BY count DESC, p.name ASC
  `).all();

  const hundredPlusLeaderboard = db.prepare(`
    SELECT p.id, p.name, p.color, p.photo, COUNT(*) AS count
    FROM (
      SELECT d.player_id, d.leg_id, d.turn_number
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE d.busted = 0 AND ${finishedMatchClause('m')}
      GROUP BY d.player_id, d.leg_id, d.turn_number
      HAVING SUM(d.score_value) >= 100
    ) t
    JOIN players p ON p.id = t.player_id
    WHERE ${visiblePlayerClause('p')}
    GROUP BY t.player_id
    ORDER BY count DESC, p.name ASC
  `).all();

  const highFinishLeaderboard = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.color,
      p.photo,
      MAX(t.turn_total) AS value
    FROM (
      SELECT d.player_id, d.leg_id, d.turn_number, SUM(d.score_value) AS turn_total
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE d.busted = 0 AND ${finishedMatchClause('m')}
      GROUP BY d.player_id, d.leg_id, d.turn_number
    ) t
    JOIN legs l ON l.id = t.leg_id AND l.winner_id = t.player_id
    JOIN players p ON p.id = t.player_id
    WHERE ${visiblePlayerClause('p')}
      AND t.turn_total >= 100
    GROUP BY p.id
    ORDER BY value DESC, p.name ASC
    LIMIT 5
  `).all();

  const triplesBySegment = [20, 19, 18, 17, 16, 15].map((segment) => ({
    segment,
    leaders: db.prepare(`
      SELECT p.id, p.name, p.color, p.photo, COUNT(*) AS count
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      JOIN players p ON p.id = d.player_id
      WHERE d.multiplier = 3
        AND d.segment = ?
        AND d.busted = 0
        AND ${visiblePlayerClause('p')}
        AND ${finishedMatchClause('m')}
      GROUP BY d.player_id
      ORDER BY count DESC, p.name ASC
    `).all(segment),
  }));

  const playerSpotlights = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.nickname,
      p.color,
      p.photo,
      COUNT(DISTINCT m.id) AS played_matches,
      COUNT(DISTINCT CASE WHEN m.winner_id = p.id THEN m.id END) AS wins
    FROM players p
    LEFT JOIN match_players mp ON mp.player_id = p.id
    LEFT JOIN matches m ON m.id = mp.match_id AND ${finishedMatchClause('m')}
    WHERE ${visiblePlayerClause('p')}
    GROUP BY p.id
    ORDER BY played_matches DESC, p.name ASC
  `).all().map((player) => {
    const stats = playerStats(player.id);
    return {
      ...player,
      avg_3dart: stats.avg_3dart,
      avg_first9: stats.avg_first9,
      checkout_pct: stats.checkout_pct,
      legs_won: stats.legs_won,
      legs_played: stats.legs_played,
      s180: stats.s180,
      s140plus: stats.s140plus,
      s100plus: stats.s100plus,
      high_round: stats.high_round,
      high_checkout: stats.high_checkout,
      dart_total: stats.dart_total,
      pct_triple: stats.pct_triple,
      pct_double: stats.pct_double,
      pct_single: stats.pct_single,
      segment_distribution: stats.segment_distribution,
      top_values: stats.top_values,
      recent_matches: recentMatchesForPlayer(db, player.id, 5),
      awards: stats.awards.slice(0, 5),
    };
  });

  const result = {
    top,
    recentMatches,
    highRound: highRound ?? null,
    highCheckout: highCheckout ?? null,
    most180: most180 ?? null,
    totalDarts: totalDarts?.c ?? 0,
    totalMatches: totalMatches?.c ?? 0,
    bestMatchAvg: bestMatchAvg ?? null,
    recentHundredPlus,
    playerWinRates,
    longestStreak,
    most100plus: most100plus ?? null,
    mostHighTriples: highTriplesLeaderboard[0] ?? null,
    highTriplesLeaderboard,
    hundredPlusLeaderboard,
    highRoundLeaderboard: highFinishLeaderboard,
    triplesBySegment,
    playerSpotlights,
    awardsCatalog: AWARD_PRIORITY,
    badgeCatalog: (() => {
      const freqRows = db.prepare(`
        SELECT a.kind, COUNT(*) AS total
        FROM awards a
        JOIN matches m ON m.id = a.match_id
        WHERE ${finishedMatchClause('m')}
        GROUP BY a.kind
      `).all();
      const freq = Object.fromEntries(freqRows.map((r) => [r.kind, r.total]));
      return [...BADGE_CATALOG].sort((a, b) => {
        const freqDelta = (freq[b.kind] ?? 0) - (freq[a.kind] ?? 0);
        if (freqDelta !== 0) return freqDelta;
        return (
          AWARD_PRIORITY.indexOf(a.kind) - AWARD_PRIORITY.indexOf(b.kind) ||
          (a.label ?? a.kind).localeCompare(b.label ?? b.kind)
        );
      });
    })(),
  };

  _lobbyCache = result;
  _lobbyCacheAt = Date.now();
  return result;
}

/**
 * Leaderboard — top players ranked by 3-dart average from finished matches.
 */
export function leaderboard(limit = 10) {
  const db = getDb();

  return db.prepare(`
    SELECT
      p.id,
      p.name,
      p.nickname,
      p.color,
      p.photo,
      ROUND((SUM(t.scored_points) * 3.0) / NULLIF(SUM(t.darts_thrown), 0), 2) AS avg_3dart,
      SUM(CASE WHEN turn_total = 180 THEN 1 ELSE 0 END) AS s180
    FROM (
      SELECT
        d.player_id,
        d.leg_id,
        d.turn_number,
        SUM(d.score_value) AS turn_total,
        SUM(d.score_value) AS scored_points,
        COUNT(*) AS darts_thrown
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      JOIN matches m ON m.id = l.match_id
      WHERE d.busted = 0 AND ${finishedMatchClause('m')}
      GROUP BY d.player_id, d.leg_id, d.turn_number
    ) t
    JOIN players p ON p.id = t.player_id
    WHERE ${visiblePlayerClause('p')}
    GROUP BY p.id
    ORDER BY avg_3dart DESC, s180 DESC, p.name ASC
    LIMIT ?
  `).all(limit);
}
