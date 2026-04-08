import { writable, derived } from 'svelte/store';

// Current screen: 'home' | 'players' | 'newMatch' | 'score'
export const screen = writable('home');

// Full match state from server
export const match = writable(null);

// Turn state from server
export const turnState = writable(null);

// Players list (fetched from /api/players)
export const players = writable([]);

// Selected multiplier for dart entry: 1=single, 2=double, 3=triple
export const multiplier = writable(1);

// Connection status
export const connected = writable(false);

// Derived: current player object
export const currentPlayer = derived(
  [match, turnState],
  ([$match, $ts]) => {
    if (!$match || !$ts) return null;
    return $match.players?.find((p) => p.id === $ts.currentPlayerId) ?? null;
  }
);

// Derived: remaining for current player
export const currentRemaining = derived(
  [turnState, currentPlayer],
  ([$ts, $cp]) => {
    if (!$ts || !$cp) return 0;
    return $ts.remaining?.[$cp.id] ?? 0;
  }
);

export function resetMatch() {
  match.set(null);
  turnState.set(null);
  multiplier.set(1);
}
