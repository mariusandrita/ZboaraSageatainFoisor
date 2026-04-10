/**
 * Match routes — all match CRUD + dart submission.
 */
import { getDb } from '../db/connection.js';
import { getIo } from '../realtime/io-instance.js';
import { submitDart, rebuildFromEvents } from '../engine/x01.js';
import { checkoutSuggestion } from '../engine/checkouts.js';
import { officialThreeDartAverageExpr } from '../stats/averages.js';
import {
  S_MATCH_STARTED, S_MATCH_STATE, S_DART_ADDED, S_TURN_ENDED, S_LEG_WON, S_MATCH_WON,
  S_CELEBRATION, S_MATCH_PAUSED, matchRoom,
} from '../realtime/events.js';

/**
 * Detect funny/award celebrations beyond the standard engine ones.
 * Returns a celebration kind string or null.
 * Priority: matematician > madhouseEscape > lunetist > zugrav > turn-end combos > centrul > big shots > overAvg
 */
function detectFunnyCelebration(segment, multiplier, scoreValue, isBust, dartInTurn, prevTurnDarts, turnStartRemaining, isFinished, playerTurnAverage = null) {
  // Matematician: bust when the remaining score was tiny (≤ 20) — bad maths
  if (isBust && turnStartRemaining <= 20) return 'matematician';

  // Champagne Shower: bust when close to finishing (21–50 remaining) — so near, so far
  if (isBust && turnStartRemaining > 20 && turnStartRemaining <= 50) return 'champagneShower';

  // Madhouse Escape: winning on double 1.
  if (!isBust && isFinished && segment === 1 && multiplier === 2) return 'madhouseEscape';

  // Motown: checkout on exactly 44 — the Four Tops (S4 + D20)
  if (!isBust && isFinished) {
    const checkoutTotal = [...prevTurnDarts, { score_value: scoreValue }].reduce((s, d) => s + d.score_value, 0);
    if (checkoutTotal === 44) return 'motown';
  }

  // Lunetist: Triple 1 — surgical precision on the worst target (supersedes lowTriple)
  if (segment === 1 && multiplier === 3 && !isBust) return 'lunetist';

  // Zugrav: complete miss — dart in the wall
  if (segment === 0) return 'zugrav';

  // Turn-end awards only apply when all 3 darts were thrown without a bust
  if (dartInTurn === 3 && !isBust) {
    const fullTurn = [...prevTurnDarts, { segment, multiplier, score_value: scoreValue }];
    const total    = fullTurn.reduce((s, d) => s + d.score_value, 0);
    const segs     = fullTurn.map((d) => d.segment).sort((a, b) => a - b);
    const mults    = fullTurn.map((d) => d.multiplier);
    const bulls    = fullTurn.filter((d) => d.segment === 25 && d.multiplier === 2).length;
    const hasSpecialShotInTurn = fullTurn.some((d) =>
      d.segment === 0
      || (d.segment === 1 && d.multiplier === 3)
      || (d.segment === 25 && d.multiplier === 2)
      || (d.segment >= 15 && (d.multiplier === 2 || d.multiplier === 3))
    );

    // Black Hat: all three darts are double bull.
    if (bulls === 3) return 'blackHat';

    // Shanghai: single + double + triple on the same number in one visit.
    const shanghaiNumber = fullTurn[0]?.segment;
    if (
      shanghaiNumber != null
      && shanghaiNumber !== 0
      && shanghaiNumber !== 25
      && fullTurn.every((d) => d.segment === shanghaiNumber)
      && mults.includes(1) && mults.includes(2) && mults.includes(3)
    ) return 'shanghai';

    // Breakfast (Bed & Breakfast): segments 1 + 5 + 20 all singles = 26
    if (segs[0] === 1 && segs[1] === 5 && segs[2] === 20 && mults.every((m) => m === 1)) return 'breakfast';

    // Bail Out: first two darts scored 20 or less in total, third dart rescues the visit.
    const firstTwoTotal = fullTurn.slice(0, 2).reduce((s, d) => s + d.score_value, 0);
    const thirdDart = fullTurn[2];
    if (thirdDart && firstTwoTotal <= 20 && thirdDart.score_value >= 40) return 'bailOut';

    // Score callout specials — named turns from pub darts culture
    if (total === 88) return 'twoFatLadies';
    if (total === 66) return 'route66';
    if (total === 55) return 'allTheFives';

    // Bucket/Buckshot: all darts hit different bands and are spread all over the board.
    const distinctSegments = new Set(fullTurn.map((d) => d.segment)).size;
    const distinctMultipliers = new Set(mults).size;
    if (distinctSegments === 3 && distinctMultipliers >= 2 && total >= 21 && total <= 60) return 'bucket';

    // Circle It: all darts on the board but total is embarrassingly tiny (under 10)
    if (total > 0 && total < 10 && fullTurn.every((d) => d.segment > 0)) return 'circleIt';

    // Hamster: all darts hit the board but total is still embarrassingly small
    if (total > 0 && total < 20 && fullTurn.every((d) => d.segment > 0)) return 'hamster';

    // Beat the player's live per-turn average.
    if (!hasSpecialShotInTurn && playerTurnAverage != null && total > playerTurnAverage) return 'overAvg';
  }

  // Centrul: bullseye (D25) when it was NOT the checkout dart
  if (segment === 25 && multiplier === 2 && !isFinished && !isBust) return 'centrul';

  // Big doubles / triples on the high numbers deserve their own callout.
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
    const prev = turnTotals.get(key) ?? { total: 0, busted: false };
    prev.total += row.busted ? 0 : (row.score_value ?? 0);
    prev.busted = prev.busted || row.busted === 1;
    turnTotals.set(key, prev);
  }

  const totals = [...turnTotals.values()].map((turn) => (turn.busted ? 0 : turn.total));
  if (totals.length === 0) return null;
  return totals.reduce((sum, total) => sum + total, 0) / totals.length;
}

function averageBeforeMatch(db, playerId, matchId) {
  return db.prepare(`
    SELECT ${officialThreeDartAverageExpr()} AS avg_3dart
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    JOIN matches m ON m.id = l.match_id
    WHERE d.player_id = ? AND m.status = 'finished' AND m.id != ?
  `).get(playerId, matchId)?.avg_3dart ?? 0;
}

function finishedAverageForPlayer(db, playerId) {
  return db.prepare(`
    SELECT ${officialThreeDartAverageExpr()} AS avg_3dart
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    JOIN matches m ON m.id = l.match_id
    WHERE d.player_id = ? AND m.status = 'finished'
  `).get(playerId)?.avg_3dart ?? 0;
}

function matchAverage(db, playerId, matchId) {
  return db.prepare(`
    SELECT ${officialThreeDartAverageExpr()} AS avg_3dart
    FROM darts d
    JOIN legs l ON l.id = d.leg_id
    WHERE l.match_id = ? AND d.player_id = ?
  `).get(matchId, playerId)?.avg_3dart ?? 0;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function activeElapsedMs(match) {
  const base = Number(match?.active_elapsed_ms ?? 0);
  const openedAt = match?.controller_opened_at;
  if (!openedAt) return base;

  const openedMs = Date.parse(openedAt.includes('T') ? openedAt : `${openedAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(openedMs)) return base;
  return base + Math.max(0, Date.now() - openedMs);
}

function pauseMatchTimer(db, matchId) {
  const match = db.prepare('SELECT active_elapsed_ms, controller_opened_at FROM matches WHERE id = ?').get(matchId);
  if (!match?.controller_opened_at) return;

  const totalMs = activeElapsedMs(match);
  db.prepare(`
    UPDATE matches
    SET active_elapsed_ms = ?, controller_opened_at = NULL
    WHERE id = ?
  `).run(totalMs, matchId);
}

function resumeMatchTimer(db, matchId) {
  db.prepare(`
    UPDATE matches
    SET controller_opened_at = COALESCE(controller_opened_at, datetime('now'))
    WHERE id = ?
  `).run(matchId);
}

function awardFinalAverageBadges(db, matchId) {
  const players = db.prepare(`
    SELECT player_id
    FROM match_players
    WHERE match_id = ?
    ORDER BY position
  `).all(matchId).map((row) => row.player_id);

  for (const playerId of players) {
    const previousAvg = averageBeforeMatch(db, playerId, matchId);
    const currentMatchAvg = matchAverage(db, playerId, matchId);
    if (!(previousAvg > 0) || !(currentMatchAvg > previousAvg)) continue;

    const lastDart = db.prepare(`
      SELECT d.id, d.leg_id
      FROM darts d
      JOIN legs l ON l.id = d.leg_id
      WHERE l.match_id = ? AND d.player_id = ?
      ORDER BY d.id DESC
      LIMIT 1
    `).get(matchId, playerId);

    if (!lastDart) continue;

    db.prepare(`
      INSERT OR IGNORE INTO awards (match_id, leg_id, dart_id, player_id, kind, value)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(matchId, lastDart.leg_id, lastDart.id, playerId, 'beatGeneral', Math.round(currentMatchAvg));
  }
}

export default async function matchRoutes(fastify) {
  const db = getDb();
  const live = () => getIo()?.of('/live');

  function nextPublicCode() {
    const next = db.prepare(`
      SELECT COALESCE(MAX(CAST(SUBSTR(public_code, 4) AS INTEGER)), 0) + 1 AS next_code
      FROM matches
      WHERE public_code LIKE 'DL-%'
    `).get()?.next_code ?? 1;

    return `DL-${String(next).padStart(5, '0')}`;
  }

  // ── helpers ────────────────────────────────────────────────────────────

  function getPlayerAwardsForMatch(matchId) {
    const rows = db.prepare(`
      SELECT player_id, kind, COUNT(*) AS count
      FROM awards
      WHERE match_id = ?
      GROUP BY player_id, kind
      ORDER BY count DESC, kind ASC
    `).all(matchId);
    const byPlayer = {};
    for (const row of rows) {
      const pid = row.player_id;
      if (!byPlayer[pid]) byPlayer[pid] = [];
      byPlayer[pid].push({ kind: row.kind, count: row.count });
    }
    return byPlayer;
  }

  function bestFinishInMatch(matchId, playerId) {
    return db.prepare(`
      SELECT MAX(turn_total) AS value
      FROM (
        SELECT d.leg_id, d.turn_number, SUM(d.score_value) AS turn_total
        FROM darts d
        JOIN legs l ON l.id = d.leg_id
        WHERE l.match_id = ? AND d.player_id = ?
        GROUP BY d.leg_id, d.turn_number
      ) t
      JOIN legs l ON l.id = t.leg_id
      WHERE l.winner_id = ? AND turn_total >= 2
    `).get(matchId, playerId, playerId)?.value ?? 0;
  }

  function getMatchFull(matchId) {
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    if (!match) return null;

    const players = db.prepare(`
      SELECT p.*, mp.position, mp.legs_won, mp.general_avg_start
      FROM match_players mp
      JOIN players p ON p.id = mp.player_id
      WHERE mp.match_id = ?
      ORDER BY mp.position
    `).all(matchId).map((player) => ({
      ...player,
      best_finish: bestFinishInMatch(matchId, player.id),
    }));

    const legs = db.prepare('SELECT * FROM legs WHERE match_id = ? ORDER BY leg_number').all(matchId);
    const activeLeg = legs.find((l) => !l.ended_at) || null;

    let turnState = null;
    if (activeLeg) {
      turnState = buildTurnState(activeLeg, match, players);
    }

    return {
      ...match,
      active_elapsed_ms: activeElapsedMs(match),
      players,
      legs,
      activeLeg,
      turnState,
    };
  }

  function buildTurnState(leg, match, players) {
    const dartRows = db.prepare(`
      SELECT * FROM darts WHERE leg_id = ?
      ORDER BY id
    `).all(leg.id);

    const playerIds = players.map((p) => p.id);
    const state = rebuildFromEvents(
      {
        startingScore: match.starting_score,
        doubleOut: match.double_out === 1,
        players: playerIds,
        startingPlayerId: leg.starting_id,
      },
      dartRows
    );

    const currentPlayerId = state.players[state.leg.currentPlayerIdx];
    const dartsLeft = 3 - state.leg.turn.length;

    // Last completed turn (for TV display)
    const currentTurnNum = state.leg.turn.length > 0
      ? (db.prepare('SELECT MAX(turn_number) AS t FROM darts WHERE leg_id = ? AND player_id = ?')
          .get(leg.id, currentPlayerId)?.t ?? 1)
      : null;
    const lastTurnInfo = db.prepare(`
      SELECT player_id, turn_number FROM darts
      WHERE leg_id = ? AND NOT (player_id = ? AND turn_number = ?)
      ORDER BY id DESC LIMIT 1
    `).get(leg.id, currentPlayerId, currentTurnNum ?? -1);
    const lastTurnDarts = lastTurnInfo
      ? db.prepare('SELECT * FROM darts WHERE leg_id = ? AND player_id = ? AND turn_number = ? ORDER BY dart_in_turn')
          .all(leg.id, lastTurnInfo.player_id, lastTurnInfo.turn_number)
      : null;

    return {
      remaining:        state.leg.remaining,
      turn:             state.leg.turn,
      currentPlayerId,
      dartsLeft,
      busted:           state.leg.turn.some((d) => d.busted),
      finished:         state.leg.finished,
      winnerId:         state.leg.winnerId,
      celebration:      state.celebration,
      lastTurnDarts,
      checkoutHint:     checkoutSuggestion(
        state.leg.remaining[currentPlayerId],
        dartsLeft,
        match.double_out === 1
      ),
    };
  }

  // ── GET /api/matches ────────────────────────────────────────────────────

  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['pending','live','finished','aborted'] } },
      },
    },
  }, async (req) => {
    const { status } = req.query;
    if (status) {
      return db.prepare('SELECT * FROM matches WHERE status = ? ORDER BY created_at DESC').all(status);
    }
    return db.prepare('SELECT * FROM matches ORDER BY created_at DESC').all();
  });

  // ── POST /api/matches ───────────────────────────────────────────────────

  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['starting_score', 'player_ids'],
        properties: {
          starting_score: { type: 'integer', enum: [301, 501, 701] },
          double_out:     { type: 'integer', enum: [0, 1], default: 1 },
          legs_to_win:    { type: 'integer', minimum: 1, maximum: 4, default: 1 },
          player_order_mode: { type: 'string', enum: ['selected', 'random'], default: 'selected' },
          player_ids:     { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 10 },
        },
      },
    },
  }, async (req, reply) => {
    const { starting_score, double_out = 1, legs_to_win = 1, player_order_mode = 'selected', player_ids } = req.body;

    // Validate players exist
    for (const pid of player_ids) {
      const p = db.prepare('SELECT id FROM players WHERE id = ? AND archived_at IS NULL AND is_playable = 1').get(pid);
      if (!p) return reply.code(404).send({ error: { code: 'PLAYER_NOT_FOUND', message: `Player ${pid} not found` } });
    }

    const orderedPlayerIds = player_order_mode === 'random' ? shuffle(player_ids) : [...player_ids];

    const create = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO matches (mode, starting_score, double_out, legs_to_win)
        VALUES ('x01', ?, ?, ?)
      `).run(starting_score, double_out, legs_to_win);

      const matchId = info.lastInsertRowid;

      for (let i = 0; i < orderedPlayerIds.length; i++) {
        const generalAvgStart = finishedAverageForPlayer(db, orderedPlayerIds[i]);
        db.prepare(`
          INSERT INTO match_players (match_id, player_id, position, general_avg_start)
          VALUES (?, ?, ?, ?)
        `).run(matchId, orderedPlayerIds[i], i, generalAvgStart);
      }

      return matchId;
    });

    const matchId = create();
    return reply.code(201).send(getMatchFull(matchId));
  });

  // ── GET /api/matches/:id ────────────────────────────────────────────────

  fastify.get('/:id', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
  }, async (req, reply) => {
    const match = getMatchFull(req.params.id);
    if (!match) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Match not found' } });
    return match;
  });

  // ── POST /api/matches/:id/start ─────────────────────────────────────────

  fastify.post('/:id/start', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
  }, async (req, reply) => {
    const { id } = req.params;
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
    if (!match) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Match not found' } });
    if (match.status !== 'pending') {
      return reply.code(409).send({ error: { code: 'INVALID_STATE', message: `Match is ${match.status}` } });
    }

    const firstPlayer = db.prepare(
      'SELECT player_id FROM match_players WHERE match_id = ? ORDER BY position LIMIT 1'
    ).get(id);
    const playerIds = db.prepare(
      'SELECT player_id FROM match_players WHERE match_id = ? ORDER BY position'
    ).all(id).map((row) => row.player_id);

    db.transaction(() => {
      for (const playerId of playerIds) {
        db.prepare(`
          UPDATE match_players
          SET general_avg_start = ?
          WHERE match_id = ? AND player_id = ?
        `).run(finishedAverageForPlayer(db, playerId), id, playerId);
      }
      db.prepare(`
        UPDATE matches
        SET status = 'live',
            started_at = datetime('now'),
            active_elapsed_ms = 0,
            controller_opened_at = datetime('now')
        WHERE id = ?
      `).run(id);
      db.prepare("INSERT INTO legs (match_id, leg_number, starting_id) VALUES (?, 1, ?)").run(id, firstPlayer.player_id);
    })();

    const full = getMatchFull(id);
    live()?.to(matchRoom(id)).emit(S_MATCH_STATE, full);
    live()?.emit(S_MATCH_STARTED, { matchId: id });
    return full;
  });

  // ── POST /api/matches/:id/abort ─────────────────────────────────────────

  fastify.post('/:id/abort', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
  }, async (req, reply) => {
    const { id } = req.params;
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
    if (!match) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Match not found' } });
    if (!['pending','live'].includes(match.status)) {
      return reply.code(409).send({ error: { code: 'INVALID_STATE', message: `Match is ${match.status}` } });
    }

    db.transaction(() => {
      pauseMatchTimer(db, id);
      db.prepare("UPDATE matches SET status = 'aborted', ended_at = datetime('now') WHERE id = ?").run(id);
    })();
    const full = getMatchFull(id);
    live()?.to(matchRoom(id)).emit(S_MATCH_STATE, full);
    return full;
  });

  // ── POST /api/matches/:id/resume ────────────────────────────────────────
  // Re-announces an existing live match so passive TV clients can re-enter it.

  fastify.post('/:id/resume', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
  }, async (req, reply) => {
    const { id } = req.params;
    const existing = getMatchFull(id);
    if (!existing) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Match not found' } });
    }
    if (existing.status !== 'live') {
      return reply.code(409).send({ error: { code: 'INVALID_STATE', message: `Match is ${existing.status}` } });
    }

    resumeMatchTimer(db, id);
    const full = getMatchFull(id);
    live()?.emit(S_MATCH_STARTED, { matchId: id });
    return full;
  });

  // ── POST /api/matches/:id/darts ─────────────────────────────────────────

  fastify.post('/:id/darts', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: {
        type: 'object',
        required: ['segment', 'multiplier'],
        properties: {
          segment:    { type: 'integer', minimum: 0, maximum: 25 },
          multiplier: { type: 'integer', enum: [1, 2, 3] },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const { segment, multiplier } = req.body;

    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
    if (!match) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Match not found' } });
    if (match.status !== 'live') {
      return reply.code(409).send({ error: { code: 'INVALID_STATE', message: 'Match is not live' } });
    }

    const leg = db.prepare('SELECT * FROM legs WHERE match_id = ? AND ended_at IS NULL ORDER BY leg_number DESC LIMIT 1').get(id);
    if (!leg) return reply.code(409).send({ error: { code: 'NO_ACTIVE_LEG', message: 'No active leg' } });

    const players = db.prepare(
      'SELECT player_id FROM match_players WHERE match_id = ? ORDER BY position'
    ).all(id).map((r) => r.player_id);

    const dartRows = db.prepare('SELECT * FROM darts WHERE leg_id = ? ORDER BY id').all(leg.id);
    const opts = {
      startingScore: match.starting_score,
      doubleOut: match.double_out === 1,
      players,
      startingPlayerId: leg.starting_id,
    };

    let state = rebuildFromEvents(opts, dartRows);

    // Determine turn_number for this dart
    const currentTurnLen = state.leg.turn.length;
    const currentPlayerId = state.players[state.leg.currentPlayerIdx];
    const lastTurn = db.prepare(
      'SELECT MAX(turn_number) AS t FROM darts WHERE leg_id = ? AND player_id = ?'
    ).get(leg.id, currentPlayerId);
    const turnNumber = currentTurnLen === 0
      ? (lastTurn?.t ?? 0) + 1
      : (lastTurn?.t ?? 1);
    const dartInTurn = currentTurnLen + 1;

    const prevPlayerIdx     = state.leg.currentPlayerIdx;
    const prevTurnLen       = state.leg.turn.length;
    const prevTurnDarts     = state.leg.turn;           // darts already in turn before this throw
    const turnStartRemaining = state.leg.turnStartRemaining;

    // Apply dart through engine
    let newState;
    try {
      newState = submitDart(state, { segment, multiplier });
    } catch (err) {
      return reply.code(400).send({ error: { code: 'ENGINE_ERROR', message: err.message } });
    }

    const scoreValue = segment * multiplier;
    const dartTurnLen = prevTurnLen + 1;
    const playerTurnAverage = currentPlayerTurnAverage(dartRows, currentPlayerId);

    const isBust = newState.leg.turn.some((d) => d.busted)
      || (newState.leg.currentPlayerIdx !== prevPlayerIdx && dartTurnLen < 3 && !newState.leg.finished);

    // Full turn including this dart — used for celebration value and funny detection
    const fullTurn     = [...prevTurnDarts, { segment, multiplier, score_value: scoreValue }];
    const fullTurnTotal = fullTurn.reduce((s, d) => s + d.score_value, 0);

    let insertedDartId = null;

    db.transaction(() => {
      const insertResult = db.prepare(`
        INSERT INTO darts (leg_id, player_id, turn_number, dart_in_turn, segment, multiplier, score_value, busted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(leg.id, currentPlayerId, turnNumber, dartInTurn, segment, multiplier, scoreValue, isBust ? 1 : 0);
      insertedDartId = Number(insertResult.lastInsertRowid);

      if (newState.leg.finished) {
        const winnerId = newState.leg.winnerId;
        db.prepare("UPDATE legs SET winner_id = ?, ended_at = datetime('now') WHERE id = ?").run(winnerId, leg.id);
        db.prepare('UPDATE match_players SET legs_won = legs_won + 1 WHERE match_id = ? AND player_id = ?').run(id, winnerId);

        // Check if match is won
        const mp = db.prepare('SELECT legs_won FROM match_players WHERE match_id = ? AND player_id = ?').get(id, winnerId);
        if (mp.legs_won >= match.legs_to_win) {
          pauseMatchTimer(db, id);
          db.prepare(`
            UPDATE matches
            SET status = 'finished',
                ended_at = datetime('now'),
                winner_id = ?,
                public_code = COALESCE(public_code, ?)
            WHERE id = ?
          `).run(winnerId, nextPublicCode(), id);
        } else {
          // Start next leg
          const legCount = db.prepare('SELECT COUNT(*) AS c FROM legs WHERE match_id = ?').get(id).c;
          const nextStarterIdx = legCount % players.length;
          const nextStarterId = players[nextStarterIdx];
          db.prepare('INSERT INTO legs (match_id, leg_number, starting_id) VALUES (?, ?, ?)').run(id, legCount + 1, nextStarterId);
        }
      }
    })();

    // Build response turnState
    const updatedMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
    const updatedPlayers = db.prepare(`
      SELECT p.*, mp.position, mp.legs_won
      FROM match_players mp JOIN players p ON p.id = mp.player_id
      WHERE mp.match_id = ? ORDER BY mp.position
    `).all(id);
    const updatedLeg = db.prepare('SELECT * FROM legs WHERE match_id = ? ORDER BY leg_number DESC LIMIT 1').get(id);
    const turnState = buildTurnState(updatedLeg, updatedMatch, updatedPlayers);

    const dartRecord = db.prepare('SELECT * FROM darts WHERE id = ?').get(insertedDartId);

    // Emit WS events
    const room = matchRoom(id);

    const funnyCelebration = detectFunnyCelebration(
      segment, multiplier, scoreValue, isBust, dartInTurn,
      prevTurnDarts, turnStartRemaining, newState.leg.finished, playerTurnAverage
    );
    let celebKind = funnyCelebration ?? newState.celebration;

    // Nine-Darter: 501 finished in exactly 9 darts — overrides everything else
    if (newState.leg.finished && dartRows.length + 1 === 9) celebKind = 'nineDarter';

    if (celebKind && celebKind !== 'overAvg') {
      db.prepare(`
        INSERT OR IGNORE INTO awards (match_id, leg_id, dart_id, player_id, kind, value)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, leg.id, insertedDartId, currentPlayerId, celebKind, fullTurnTotal);
    }

    live()?.to(room).emit(S_DART_ADDED, { dart: dartRecord, turnState, playerAwards: getPlayerAwardsForMatch(id) });

    if (celebKind) {
      live()?.to(room).emit(S_CELEBRATION, {
        kind: celebKind,
        playerId: currentPlayerId,
        value: fullTurnTotal,
      });
    }

    if (newState.leg.currentPlayerIdx !== prevPlayerIdx || newState.leg.finished) {
      if (newState.leg.finished) {
        const full = getMatchFull(id);
        live()?.to(room).emit(S_LEG_WON, { legId: leg.id, winnerId: newState.leg.winnerId, matchState: full });

        if (updatedMatch.status === 'finished') {
          awardFinalAverageBadges(db, id);
          live()?.to(room).emit(S_MATCH_WON, { matchId: id, winnerId: newState.leg.winnerId });
        }
      } else {
        live()?.to(room).emit(S_TURN_ENDED, {
          turnState,
          nextPlayerId: turnState.currentPlayerId,
        });
      }
    }

    return turnState;
  });

  // ── POST /api/matches/:id/undo ──────────────────────────────────────────

  fastify.post('/:id/undo', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
  }, async (req, reply) => {
    const { id } = req.params;

    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
    if (!match) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Match not found' } });
    if (match.status !== 'live') {
      return reply.code(409).send({ error: { code: 'INVALID_STATE', message: 'Match is not live' } });
    }

    // Find the most recently closed leg (if leg just finished) or active leg
    const activeLeg = db.prepare('SELECT * FROM legs WHERE match_id = ? AND ended_at IS NULL ORDER BY leg_number DESC LIMIT 1').get(id);
    const legToUndo = activeLeg
      ?? db.prepare('SELECT * FROM legs WHERE match_id = ? ORDER BY leg_number DESC LIMIT 1').get(id);

    if (!legToUndo) return reply.code(409).send({ error: { code: 'NO_LEG', message: 'No leg to undo' } });

    // Get last dart
    const lastDart = db.prepare('SELECT * FROM darts WHERE leg_id = ? ORDER BY id DESC LIMIT 1').get(legToUndo.id);
    if (!lastDart) return reply.code(409).send({ error: { code: 'NO_DARTS', message: 'No darts to undo' } });

    db.transaction(() => {
      db.prepare('DELETE FROM darts WHERE id = ?').run(lastDart.id);

      // If the leg had finished, re-open it
      if (!activeLeg) {
        db.prepare('UPDATE legs SET winner_id = NULL, ended_at = NULL WHERE id = ?').run(legToUndo.id);
        db.prepare('UPDATE match_players SET legs_won = legs_won - 1 WHERE match_id = ? AND player_id = ?').run(id, legToUndo.winner_id);
        db.prepare("UPDATE matches SET status = 'live', ended_at = NULL, winner_id = NULL, public_code = NULL WHERE id = ?").run(id);
        // Also delete the next leg that may have been created
        const nextLeg = db.prepare('SELECT * FROM legs WHERE match_id = ? AND leg_number > ? ORDER BY leg_number LIMIT 1').get(id, legToUndo.leg_number);
        if (nextLeg && !db.prepare('SELECT id FROM darts WHERE leg_id = ?').get(nextLeg.id)) {
          db.prepare('DELETE FROM legs WHERE id = ?').run(nextLeg.id);
        }
      }
    })();

    const updatedMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
    const updatedPlayers = db.prepare(`
      SELECT p.*, mp.position, mp.legs_won
      FROM match_players mp JOIN players p ON p.id = mp.player_id
      WHERE mp.match_id = ? ORDER BY mp.position
    `).all(id);
    const currentLeg = db.prepare('SELECT * FROM legs WHERE match_id = ? AND ended_at IS NULL ORDER BY leg_number DESC LIMIT 1').get(id);
    const turnState = buildTurnState(currentLeg, updatedMatch, updatedPlayers);

    const full = getMatchFull(id);
    live()?.to(matchRoom(id)).emit(S_MATCH_STATE, { ...full, playerAwards: getPlayerAwardsForMatch(id) });

    return turnState;
  });

  // ── POST /api/matches/:id/exit ──────────────────────────────────────────
  // Controller user pressed Ieșire — keep match live but signal TV to lobby

  fastify.post('/:id/exit', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
  }, async (req, reply) => {
    const { id } = req.params;
    pauseMatchTimer(db, id);
    live()?.to(matchRoom(id)).emit(S_MATCH_PAUSED, { matchId: id });
    return reply.code(204).send();
  });
}
