/**
 * Pure X01 game engine — no I/O, no side effects.
 * All functions take state + input and return new state (structuredClone).
 *
 * @typedef {{ segment: number, multiplier: number, score_value: number, busted?: boolean }} DartInput
 *
 * @typedef {{
 *   startingScore: 301|501|701,
 *   doubleOut: boolean,
 *   players: number[],
 *   leg: {
 *     currentPlayerIdx: number,
 *     remaining: Record<number, number>,
 *     turn: DartInput[],
 *     turnStartRemaining: number,
 *     finished: boolean,
 *     winnerId: number|null,
 *   },
 *   celebration: 'none'|'180'|'highFinish'|'bullFinish'|null,
 * }} LegState
 */

/** @param {{ startingScore: number, doubleOut: boolean, players: number[] }} opts */
export function newLeg({ startingScore, doubleOut, players }) {
  if (!Number.isInteger(startingScore) || startingScore < 2) {
    throw new Error(`Invalid starting score: ${startingScore}`);
  }
  if (!players || players.length < 1) {
    throw new Error('At least one player required');
  }

  const remaining = {};
  for (const id of players) remaining[id] = startingScore;

  return {
    startingScore,
    doubleOut,
    players: [...players],
    leg: {
      currentPlayerIdx: 0,
      remaining,
      turn: [],
      turnStartRemaining: startingScore,
      finished: false,
      winnerId: null,
    },
    celebration: null,
  };
}

/**
 * Submit a dart for the current player.
 * Returns new LegState — automatically ends turn after 3 darts, on bust, or on checkout.
 *
 * @param {LegState} state
 * @param {{ segment: number, multiplier: number }} dart
 * @returns {LegState}
 */
export function submitDart(state, { segment, multiplier }) {
  if (state.leg.finished) throw new Error('Leg already finished');
  if (state.leg.turn.length >= 3) throw new Error('Turn already complete — call endTurn first');
  if (segment === 25 && multiplier === 3) throw new Error('Invalid: bull cannot be tripled');
  if (multiplier < 1 || multiplier > 3) throw new Error(`Invalid multiplier: ${multiplier}`);
  if (![0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,25].includes(segment)) {
    throw new Error(`Invalid segment: ${segment}`);
  }

  const score_value = segment * multiplier;
  const dart = { segment, multiplier, score_value, busted: false };

  const s = clone(state);
  s.celebration = null;

  const playerId = s.players[s.leg.currentPlayerIdx];
  const prev = s.leg.remaining[playerId];
  const next = prev - score_value;

  // --- Bust detection ---
  const busted = isBust(next, dart, s.doubleOut);

  if (busted) {
    dart.busted = true;
    s.leg.turn.push(dart);
    s.celebration = 'bust';
    return _endTurn(s);
  }

  // --- Checkout ---
  if (next === 0) {
    s.leg.remaining[playerId] = 0;
    s.leg.turn.push(dart);
    s.leg.finished = true;
    s.leg.winnerId = playerId;

    const turnTotal = s.leg.turn.reduce((acc, d) => acc + d.score_value, 0);
    if (turnTotal === 180) {
      s.celebration = '180';
    } else if (dart.segment === 25 && dart.multiplier === 2) {
      s.celebration = 'bullFinish';
    } else if (turnTotal >= 100) {
      s.celebration = 'highFinish';
    }
    return s;
  }

  // --- Normal dart ---
  s.leg.remaining[playerId] = next;
  s.leg.turn.push(dart);

  // Auto-end turn after 3rd dart
  if (s.leg.turn.length === 3) {
    const turnTotal = s.leg.turn.reduce((acc, d) => acc + d.score_value, 0);
    if (turnTotal === 180) s.celebration = '180';
    else if (turnTotal === 0) s.celebration = 'threeMisses';
    else if (turnTotal >= 140) s.celebration = 'ton140';
    else if (s.leg.turn.some(d => d.multiplier === 3 && d.segment <= 5)) s.celebration = 'lowTriple';
    return _endTurn(s);
  }

  return s;
}

/**
 * Explicitly end the current turn (e.g. player pressed "done" early, or force-skip).
 * @param {LegState} state
 * @returns {LegState}
 */
export function endTurn(state) {
  if (state.leg.finished) throw new Error('Leg already finished');
  return _endTurn(clone(state));
}

/**
 * Undo the last dart in the current turn.
 * If the turn is empty, throws — caller should rebuild from event store.
 * @param {LegState} state
 * @returns {LegState}
 */
export function undoDart(state) {
  const s = clone(state);

  if (s.leg.turn.length === 0) {
    throw new Error('Turn is empty — rebuild from event store for cross-turn undo');
  }

  const playerId = s.players[s.leg.currentPlayerIdx];
  const dart = s.leg.turn.pop();

  // Un-finish if leg was just checked out
  if (s.leg.finished) {
    s.leg.finished = false;
    s.leg.winnerId = null;
    s.leg.remaining[playerId] += dart.score_value; // restore
    s.celebration = null;
    return s;
  }

  // If dart was busted, remaining was never changed, nothing to restore
  if (!dart.busted) {
    s.leg.remaining[playerId] += dart.score_value;
  }

  s.celebration = null;
  return s;
}

/**
 * Rebuild full LegState by replaying an ordered list of dart records from the DB.
 * @param {{ startingScore: number, doubleOut: boolean, players: number[] }} opts
 * @param {Array<{ player_id: number, segment: number, multiplier: number, score_value: number, turn_number: number, dart_in_turn: number, busted: number }>} dartRows
 * @returns {LegState}
 */
export function rebuildFromEvents(opts, dartRows) {
  let state = newLeg(opts);
  if (!dartRows || dartRows.length === 0) return state;

  // Group darts by (turn_number, player_id) — already ordered by turn_number, dart_in_turn
  for (const row of dartRows) {
    if (state.leg.finished) break;

    const currentPlayerId = state.players[state.leg.currentPlayerIdx];
    if (row.player_id !== currentPlayerId) {
      throw new Error(
        `Event order mismatch: expected player ${currentPlayerId}, got ${row.player_id}`
      );
    }

    try {
      state = submitDart(state, { segment: row.segment, multiplier: row.multiplier });
    } catch (err) {
      // Ignore "turn already complete" — shouldn't happen with valid data
      throw new Error(`Replay error at dart ${row.id}: ${err.message}`);
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _endTurn(s) {
  const playerId = s.players[s.leg.currentPlayerIdx];

  // Revert remaining if bust
  const hasBust = s.leg.turn.some((d) => d.busted);
  if (hasBust) {
    s.leg.remaining[playerId] = s.leg.turnStartRemaining;
  }

  // Advance to next player
  const nextIdx = (s.leg.currentPlayerIdx + 1) % s.players.length;
  s.leg.currentPlayerIdx = nextIdx;
  const nextPlayerId = s.players[nextIdx];

  s.leg.turn = [];
  s.leg.turnStartRemaining = s.leg.remaining[nextPlayerId];

  return s;
}

/**
 * @param {number} newRemaining  score after the dart
 * @param {{ multiplier: number }} dart
 * @param {boolean} doubleOut
 */
function isBust(newRemaining, dart, doubleOut) {
  if (newRemaining < 0) return true;
  if (doubleOut) {
    if (newRemaining === 0 && dart.multiplier !== 2) return true; // must finish on double
    if (newRemaining === 1) return true; // can never finish on 1
  }
  return false;
}

function clone(obj) {
  return structuredClone(obj);
}

// Re-export for convenience
export { isBust };
