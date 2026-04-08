/**
 * Socket.IO event catalog — single source of truth for event names.
 * Namespace: /live
 */

// Server → Client
export const S_MATCH_STARTED = 'match:started';   // { matchId } — broadcast to all /live clients
export const S_MATCH_STATE   = 'match:state';     // full MatchFull snapshot
export const S_DART_ADDED    = 'dart:added';      // { dart, turnState }
export const S_TURN_ENDED    = 'turn:ended';      // { turnState, nextPlayerId }
export const S_LEG_WON       = 'leg:won';         // { legId, winnerId, matchState }
export const S_MATCH_WON     = 'match:won';       // { matchId, winnerId }
export const S_CELEBRATION   = 'celebration';     // { kind, playerId, value }
export const S_MATCH_PAUSED  = 'match:paused';    // { matchId } — controller exited, TV back to lobby

// Client → Server
export const C_JOIN           = 'join';           // { matchId, role: 'tv'|'controller' }
export const C_DART_SUBMIT    = 'dart:submit';    // { segment, multiplier }
export const C_TURN_UNDO      = 'turn:undo';      // (no payload)
export const C_TURN_SKIP      = 'turn:skip';      // (no payload, safety net)

// Room naming
export const matchRoom = (matchId) => `match:${matchId}`;
