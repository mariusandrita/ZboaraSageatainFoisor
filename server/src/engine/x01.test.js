import { describe, it, expect } from 'vitest';
import { newLeg, submitDart, undoDart, endTurn, rebuildFromEvents } from './x01.js';

// ── helpers ────────────────────────────────────────────────────────────────

const d = (segment, multiplier) => ({ segment, multiplier });
const T = (n) => d(n, 3); // triple
const D = (n) => d(n, 2); // double
const S = (n) => d(n, 1); // single
const BULL = d(25, 2);    // bullseye 50
const OBULL = d(25, 1);   // outer bull 25

function start501(players = [1, 2], doubleOut = true) {
  return newLeg({ startingScore: 501, doubleOut, players });
}

function throwDarts(state, ...darts) {
  for (const dart of darts) state = submitDart(state, dart);
  return state;
}

// ── newLeg ─────────────────────────────────────────────────────────────────

describe('newLeg', () => {
  it('initialises remaining to startingScore for all players', () => {
    const s = newLeg({ startingScore: 501, doubleOut: true, players: [1, 2, 3] });
    expect(s.leg.remaining[1]).toBe(501);
    expect(s.leg.remaining[2]).toBe(501);
    expect(s.leg.remaining[3]).toBe(501);
  });

  it('sets currentPlayerIdx to 0', () => {
    expect(start501().leg.currentPlayerIdx).toBe(0);
  });

  it('starts with the requested starting player', () => {
    const s = newLeg({ startingScore: 501, doubleOut: true, players: [1, 2, 3], startingPlayerId: 3 });
    expect(s.leg.currentPlayerIdx).toBe(2);
  });

  it('supports 301 and 701', () => {
    const s = newLeg({ startingScore: 301, doubleOut: true, players: [1] });
    expect(s.leg.remaining[1]).toBe(301);
    const s2 = newLeg({ startingScore: 701, doubleOut: true, players: [1] });
    expect(s2.leg.remaining[1]).toBe(701);
  });

  it('throws on invalid startingScore (< 2)', () => {
    expect(() => newLeg({ startingScore: 1,    doubleOut: true, players: [1] })).toThrow();
    expect(() => newLeg({ startingScore: 0,    doubleOut: true, players: [1] })).toThrow();
    expect(() => newLeg({ startingScore: -10,  doubleOut: true, players: [1] })).toThrow();
    expect(() => newLeg({ startingScore: 1.5,  doubleOut: true, players: [1] })).toThrow();
  });
});

// ── normal scoring ─────────────────────────────────────────────────────────

describe('submitDart — normal scoring', () => {
  it('reduces remaining by score_value', () => {
    let s = start501([1]);
    s = submitDart(s, T(20));   // 60
    expect(s.leg.remaining[1]).toBe(441);
  });

  it('auto-ends turn after 3 darts', () => {
    let s = start501([1, 2]);
    s = throwDarts(s, T(20), T(20), T(20)); // 180, player 1 done
    expect(s.leg.turn).toHaveLength(0);     // turn reset
    expect(s.leg.currentPlayerIdx).toBe(1); // moved to player 2
  });

  it('does not advance player after 1 or 2 darts', () => {
    let s = start501([1, 2]);
    s = submitDart(s, T(20));
    expect(s.leg.currentPlayerIdx).toBe(0);
    s = submitDart(s, T(20));
    expect(s.leg.currentPlayerIdx).toBe(0);
  });

  it('wraps back to player 0 after last player finishes turn', () => {
    let s = start501([1, 2]);
    s = throwDarts(s, T(20), T(20), T(20)); // p1 turn ends
    s = throwDarts(s, T(20), T(20), T(20)); // p2 turn ends
    expect(s.leg.currentPlayerIdx).toBe(0);
  });

  it('scores a single correctly', () => {
    let s = start501([1]);
    s = submitDart(s, S(5));
    expect(s.leg.remaining[1]).toBe(496);
  });

  it('segment 0 (missed) scores 0', () => {
    let s = start501([1]);
    s = submitDart(s, d(0, 1));
    expect(s.leg.remaining[1]).toBe(501);
  });
});

// ── bust detection ─────────────────────────────────────────────────────────

describe('bust detection', () => {
  it('busts when remaining goes below 0', () => {
    // set remaining to 10, throw 11
    let s = newLeg({ startingScore: 301, doubleOut: true, players: [1] });
    // reduce to 10 with a series: T20*4 = 240, T20*2 = 120, then S11 = 11 → 301-240-120+11=nope
    // easier: manually verify by using 301 - T20(60)*4 = 301-60-60-60 after 3 throws then next turn
    // Let's just go below
    let state = newLeg({ startingScore: 32, doubleOut: true, players: [1] });
    // 32 remaining, throw T11 = 33 → busts (33 > 32 → remaining would be -1)
    state = submitDart(state, T(11)); // 33
    expect(state.leg.remaining[1]).toBe(32); // reverted after bust
    expect(state.leg.turn).toHaveLength(0);  // turn ended
  });

  it('busts when remaining goes exactly to 1 (double-out)', () => {
    let s = newLeg({ startingScore: 3, doubleOut: true, players: [1] });
    s = submitDart(s, S(2)); // 3-2=1 → bust (can't finish on 1 with a double)
    expect(s.leg.remaining[1]).toBe(3); // reverted
  });

  it('busts on 0 with a single when double-out is on', () => {
    let s = newLeg({ startingScore: 20, doubleOut: true, players: [1] });
    s = submitDart(s, S(20)); // hits 20 with single → 0 but not a double
    expect(s.leg.remaining[1]).toBe(20); // bust, reverted
  });

  it('busts on 0 with a triple when double-out is on', () => {
    let s = newLeg({ startingScore: 60, doubleOut: true, players: [1] });
    s = submitDart(s, T(20)); // 60 → 0 but triple finish → bust
    expect(s.leg.remaining[1]).toBe(60);
  });

  it('does NOT bust on 0 with single when double-out is OFF', () => {
    let s = newLeg({ startingScore: 20, doubleOut: false, players: [1] });
    s = submitDart(s, S(20));
    expect(s.leg.finished).toBe(true);
    expect(s.leg.winnerId).toBe(1);
  });

  it('does NOT bust when remaining is 1 and double-out is OFF', () => {
    let s = newLeg({ startingScore: 3, doubleOut: false, players: [1] });
    s = submitDart(s, S(2)); // 3-2=1, not a bust without double-out
    expect(s.leg.remaining[1]).toBe(1);
  });

  it('reverts remaining to turnStartRemaining after bust mid-turn', () => {
    let s = newLeg({ startingScore: 60, doubleOut: true, players: [1] });
    s = submitDart(s, T(19)); // 60-57=3
    s = submitDart(s, S(3));  // 3-3=0 but single → bust
    expect(s.leg.remaining[1]).toBe(60); // reverted to turn start
  });
});

// ── checkout ───────────────────────────────────────────────────────────────

describe('checkout', () => {
  it('finishes leg on double-out', () => {
    let s = newLeg({ startingScore: 40, doubleOut: true, players: [1] });
    s = submitDart(s, D(20)); // 40 with D20
    expect(s.leg.finished).toBe(true);
    expect(s.leg.winnerId).toBe(1);
  });

  it('finishes leg on bullseye (double bull counts as double)', () => {
    let s = newLeg({ startingScore: 50, doubleOut: true, players: [1] });
    s = submitDart(s, BULL);
    expect(s.leg.finished).toBe(true);
    expect(s.leg.winnerId).toBe(1);
  });

  it('does NOT finish on outer bull when double-out is on and remaining is 25', () => {
    let state = newLeg({ startingScore: 25, doubleOut: true, players: [1] });
    state = submitDart(state, OBULL); // outer bull = 25×1 = single, not double
    expect(state.leg.finished).toBe(false);
    expect(state.leg.remaining[1]).toBe(25); // bust
  });

  it('finishes on D1 = 2', () => {
    let s = newLeg({ startingScore: 2, doubleOut: true, players: [1] });
    s = submitDart(s, D(1));
    expect(s.leg.finished).toBe(true);
  });

  it('remaining becomes 0 after checkout', () => {
    let s = newLeg({ startingScore: 40, doubleOut: true, players: [1] });
    s = submitDart(s, D(20));
    expect(s.leg.remaining[1]).toBe(0);
  });

  it('leg is not finished for the wrong player', () => {
    let s = start501([1, 2]);
    s = newLeg({ startingScore: 40, doubleOut: true, players: [1, 2] });
    s = submitDart(s, D(20)); // player 1 checks out
    expect(s.leg.winnerId).toBe(1);
    expect(s.leg.remaining[2]).toBe(40); // player 2 untouched
  });
});

// ── 180 detection ──────────────────────────────────────────────────────────

describe('180 detection', () => {
  it('sets celebration=180 when T20 T20 T20', () => {
    let s = start501([1]);
    s = throwDarts(s, T(20), T(20), T(20));
    expect(s.celebration).toBe('180');
  });

  it('does NOT set 180 for T19 T19 T19 = 171', () => {
    let s = start501([1]);
    s = throwDarts(s, T(19), T(19), T(19));
    expect(s.celebration).toBe('ton140');
  });

  it('180 celebration persists on returned state', () => {
    let s = start501([1, 2]);
    s = throwDarts(s, T(20), T(20), T(20));
    expect(s.celebration).toBe('180');
  });
});

// ── high finish / bull finish celebrations ─────────────────────────────────

describe('celebrations', () => {
  it('ton100 when a normal turn totals between 100 and 139', () => {
    let s = start501([1]);
    s = throwDarts(s, T(20), T(20), D(5));
    expect(s.celebration).toBe('ton100');
  });

  it('prefers ton140 over ton100 for turns of 140+', () => {
    let s = start501([1]);
    s = throwDarts(s, T(20), T(20), D(10));
    expect(s.celebration).toBe('ton140');
  });

  it('bullFinish when checkout is on bullseye', () => {
    let s = newLeg({ startingScore: 50, doubleOut: true, players: [1] });
    s = submitDart(s, BULL);
    expect(s.celebration).toBe('bullFinish');
  });

  it('highFinish when checkout total >= 100', () => {
    // T20(60) + T20(60) + D10(20) = 140 — but we need remaining = 140
    let s = newLeg({ startingScore: 140, doubleOut: true, players: [1] });
    s = throwDarts(s, T(20), T(20), D(10));
    expect(s.celebration).toBe('highFinish');
  });

  it('no celebration on a normal checkout < 100', () => {
    let s = newLeg({ startingScore: 32, doubleOut: true, players: [1] });
    s = submitDart(s, D(16));
    expect(s.celebration).toBeNull();
  });
});

// ── undoDart ───────────────────────────────────────────────────────────────

describe('undoDart', () => {
  it('pops the last dart from current turn', () => {
    let s = start501([1]);
    s = submitDart(s, T(20)); // 441
    s = undoDart(s);
    expect(s.leg.remaining[1]).toBe(501);
    expect(s.leg.turn).toHaveLength(0);
  });

  it('restores remaining correctly', () => {
    let s = start501([1]);
    s = submitDart(s, T(20)); // 441
    s = submitDart(s, T(19)); // 441-57=384
    s = undoDart(s);
    expect(s.leg.remaining[1]).toBe(441);
  });

  it('throws when turn is empty', () => {
    const s = start501([1]);
    expect(() => undoDart(s)).toThrow();
  });

  it('undoes a checkout (un-finishes the leg)', () => {
    let s = newLeg({ startingScore: 40, doubleOut: true, players: [1] });
    s = submitDart(s, D(20));
    expect(s.leg.finished).toBe(true);
    s = undoDart(s);
    expect(s.leg.finished).toBe(false);
    expect(s.leg.remaining[1]).toBe(40);
  });

  it('clears celebration on undo', () => {
    let s = start501([1]);
    s = throwDarts(s, T(20), T(20), T(20)); // 180
    expect(s.celebration).toBe('180');
    // turn has ended, so we'd need a cross-turn undo — just verify current
    // state has no active turn. For within-turn:
    let s2 = start501([1]);
    s2 = throwDarts(s2, T(20), T(20));
    s2 = undoDart(s2);
    expect(s2.celebration).toBeNull();
  });
});

// ── endTurn ────────────────────────────────────────────────────────────────

describe('endTurn', () => {
  it('advances to next player', () => {
    let s = start501([1, 2]);
    s = submitDart(s, T(20));
    s = endTurn(s);
    expect(s.leg.currentPlayerIdx).toBe(1);
  });

  it('resets turn array', () => {
    let s = start501([1, 2]);
    s = submitDart(s, T(20));
    s = endTurn(s);
    expect(s.leg.turn).toHaveLength(0);
  });

  it('sets turnStartRemaining to next player remaining', () => {
    let s = start501([1, 2]);
    s = submitDart(s, T(20)); // p1: 441
    s = endTurn(s);
    expect(s.leg.turnStartRemaining).toBe(501); // p2 is fresh
  });

  it('throws on finished leg', () => {
    let s = newLeg({ startingScore: 40, doubleOut: true, players: [1] });
    s = submitDart(s, D(20));
    expect(() => endTurn(s)).toThrow();
  });
});

// ── rebuildFromEvents ──────────────────────────────────────────────────────

describe('rebuildFromEvents', () => {
  it('rebuilds state identical to live play', () => {
    const players = [1, 2];
    let live = newLeg({ startingScore: 501, doubleOut: true, players });
    live = submitDart(live, T(20));
    live = submitDart(live, T(19));
    live = submitDart(live, T(18));
    // After turn ends → player 2
    live = submitDart(live, T(17));

    // Build event rows from the live play
    const rows = [
      { player_id: 1, segment: 20, multiplier: 3, score_value: 60, turn_number: 1, dart_in_turn: 1, busted: 0 },
      { player_id: 1, segment: 19, multiplier: 3, score_value: 57, turn_number: 1, dart_in_turn: 2, busted: 0 },
      { player_id: 1, segment: 18, multiplier: 3, score_value: 54, turn_number: 1, dart_in_turn: 3, busted: 0 },
      { player_id: 2, segment: 17, multiplier: 3, score_value: 51, turn_number: 1, dart_in_turn: 1, busted: 0 },
    ];

    const rebuilt = rebuildFromEvents({ startingScore: 501, doubleOut: true, players }, rows);

    expect(rebuilt.leg.remaining[1]).toBe(live.leg.remaining[1]);
    expect(rebuilt.leg.remaining[2]).toBe(live.leg.remaining[2]);
    expect(rebuilt.leg.currentPlayerIdx).toBe(live.leg.currentPlayerIdx);
  });

  it('returns fresh leg state with empty rows', () => {
    const s = rebuildFromEvents({ startingScore: 501, doubleOut: true, players: [1] }, []);
    expect(s.leg.remaining[1]).toBe(501);
  });

  it('honors the requested starting player before any darts are thrown', () => {
    const s = rebuildFromEvents({ startingScore: 501, doubleOut: true, players: [1, 2, 3], startingPlayerId: 2 }, []);
    expect(s.leg.currentPlayerIdx).toBe(1);
  });
});

// ── invalid inputs ─────────────────────────────────────────────────────────

describe('invalid inputs', () => {
  it('throws on bull with triple multiplier', () => {
    const s = start501([1]);
    expect(() => submitDart(s, d(25, 3))).toThrow();
  });

  it('throws on invalid segment', () => {
    const s = start501([1]);
    expect(() => submitDart(s, d(21, 1))).toThrow();
  });

  it('throws on invalid multiplier', () => {
    const s = start501([1]);
    expect(() => submitDart(s, d(20, 4))).toThrow();
  });

  it('throws when submitting to finished leg', () => {
    let s = newLeg({ startingScore: 40, doubleOut: true, players: [1] });
    s = submitDart(s, D(20));
    expect(() => submitDart(s, T(20))).toThrow();
  });
});

// ── multi-player turn rotation ─────────────────────────────────────────────

describe('multi-player turn rotation', () => {
  it('rotates through 3 players correctly', () => {
    let s = start501([1, 2, 3]);
    s = throwDarts(s, T(20), T(20), T(20)); // p1
    expect(s.leg.currentPlayerIdx).toBe(1);
    s = throwDarts(s, T(19), T(19), T(19)); // p2
    expect(s.leg.currentPlayerIdx).toBe(2);
    s = throwDarts(s, T(18), T(18), T(18)); // p3
    expect(s.leg.currentPlayerIdx).toBe(0); // back to p1
  });

  it('only the current player\'s remaining changes', () => {
    let s = start501([1, 2, 3]);
    s = submitDart(s, T(20));
    expect(s.leg.remaining[2]).toBe(501);
    expect(s.leg.remaining[3]).toBe(501);
  });
});

// ── edge cases ─────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('segment 0 (miss) scores 0 and does not bust', () => {
    let s = newLeg({ startingScore: 2, doubleOut: true, players: [1] });
    s = submitDart(s, d(0, 1));
    expect(s.leg.remaining[1]).toBe(2);
    expect(s.leg.finished).toBe(false);
  });

  it('outer bull (25×1=25) does not bust when remaining > 26', () => {
    let s = start501([1]);
    s = submitDart(s, OBULL);
    expect(s.leg.remaining[1]).toBe(476);
  });

  it('player with remaining 2 busts on S2 (single, not double)', () => {
    let s = newLeg({ startingScore: 2, doubleOut: true, players: [1] });
    s = submitDart(s, S(2)); // remaining → 0 but not a double
    expect(s.leg.remaining[1]).toBe(2); // bust
    expect(s.leg.finished).toBe(false);
  });

  it('501 can be finished in 9 darts (perfect leg)', () => {
    // 9 darts: T20 T20 T20  T20 T20 T20  T20 T19 D12 = 501
    let s = start501([1]);
    s = throwDarts(s, T(20), T(20), T(20)); // 180 → 321
    s = throwDarts(s, T(20), T(20), T(20)); // 180 → 141
    s = throwDarts(s, T(20), T(19), D(12)); // 60+57+24=141 ✓
    expect(s.leg.finished).toBe(true);
    expect(s.leg.remaining[1]).toBe(0);
  });
});
