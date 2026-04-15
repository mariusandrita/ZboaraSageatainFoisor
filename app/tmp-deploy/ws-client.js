/**
 * Shared Socket.IO client wrapper.
 * Works in both controller and TV apps.
 *
 * Usage:
 *   import { createWsClient } from '../../shared/ws-client.js';
 *   const ws = createWsClient();
 *   ws.join(matchId, 'controller');
 *   ws.onDartAdded((dart, turnState) => { ... });
 */
import { io } from 'socket.io-client';

const SERVER_URL = typeof window !== 'undefined'
  ? window.location.origin
  : 'http://localhost:80';

export function createWsClient() {
  const socket = io(`${SERVER_URL}/live`, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    transports: ['websocket', 'polling'],
  });

  // ── Connection events ─────────────────────────────────────────────────

  socket.on('connect', () => {
    console.info('[WS] connected', socket.id);
    // Re-join match room after reconnect if we have one
    if (socket._matchId) {
      socket.emit('join', { matchId: socket._matchId, role: socket._role });
    }
  });

  socket.on('disconnect', (reason) => {
    console.warn('[WS] disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[WS] connect error:', err.message);
  });

  // ── Public API ────────────────────────────────────────────────────────

  return {
    socket,

    join(matchId, role = 'controller') {
      socket._matchId = matchId;
      socket._role = role;
      socket.emit('join', { matchId, role });
    },

    submitDart(segment, multiplier) {
      socket.emit('dart:submit', { segment, multiplier });
    },

    undo() {
      socket.emit('turn:undo');
    },

    skip() {
      socket.emit('turn:skip');
    },

    updateMatchSetup(setup) {
      socket.emit('match:setup:update', setup);
    },

    clearMatchSetup() {
      socket.emit('match:setup:update', null);
    },

    // ── Listeners ────────────────────────────────────────────────────

    onMatchStarted(cb) { socket.on('match:started', cb); },
    onMatchState(cb)   { socket.on('match:state',   cb); },
    onDartAdded(cb)    { socket.on('dart:added',    ({ dart, turnState, playerAwards }) => cb(dart, turnState, playerAwards)); },
    onTurnEnded(cb)    { socket.on('turn:ended',    ({ turnState, nextPlayerId }) => cb(turnState, nextPlayerId)); },
    onLegWon(cb)       { socket.on('leg:won',       cb); },
    onMatchWon(cb)     { socket.on('match:won',     cb); },
    onCelebration(cb)  { socket.on('celebration',   cb); },
    onMatchPaused(cb)  { socket.on('match:paused',  cb); },
    onMatchSetup(cb)   { socket.on('match:setup',   cb); },

    offAll() {
      ['match:state','dart:added','turn:ended','leg:won','match:won','celebration','match:paused','match:setup'].forEach((e) => socket.off(e));
    },

    disconnect() {
      socket._matchId = null;
      socket._role = null;
      socket.disconnect();
    },
  };
}
