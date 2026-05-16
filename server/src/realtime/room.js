/**
 * Per-match Socket.IO room handler.
 * Called once after the Socket.IO server is created, sets up all socket events.
 */
import {
  C_JOIN, C_DART_SUBMIT, C_TURN_UNDO, C_TURN_SKIP, C_MATCH_SETUP,
  S_MATCH_STATE, S_MATCH_SETUP, matchRoom,
} from './events.js';

/**
 * @param {import('socket.io').Server} io
 * @param {import('fastify').FastifyInstance} fastify
 */
export function setupRealtime(io, fastify) {
  const live = io.of('/live');
  liveNamespace = live;

  live.on('connection', (socket) => {
    fastify.log.info(`WS connect: ${socket.id}`);

    if (pendingMatchSetup) {
      socket.emit(S_MATCH_SETUP, pendingMatchSetup);
    }

    // join — client joins a match room
    socket.on(C_JOIN, async ({ matchId, role }) => {
      if (!matchId) return;
      const room = matchRoom(matchId);
      socket.join(room);
      socket.data.matchId = matchId;
      socket.data.role = role;

      fastify.log.info(`WS join: ${socket.id} → ${room} as ${role}`);

      if (role === 'tv') {
        try { await fastify.inject({ method: 'POST', url: `/api/matches/${matchId}/tv-join` }); } catch (e) {}
      }

      // Send full state snapshot (including turnState) to the joining client
      try {
        const response = await fastify.inject({ method: 'GET', url: `/api/matches/${matchId}` });
        if (response.statusCode === 200) {
          socket.emit(S_MATCH_STATE, JSON.parse(response.body));
        }
      } catch (err) {
        fastify.log.error(err, 'Error sending match state on join');
      }
    });

    // dart:submit — controller submits a dart via WS (mirrors REST POST /darts)
    socket.on(C_DART_SUBMIT, async ({ segment, multiplier }) => {
      const { matchId } = socket.data;
      if (!matchId || socket.data.role !== 'controller') return;

      try {
        await fastify.inject({
          method: 'POST',
          url: `/api/matches/${matchId}/darts`,
          payload: { segment, multiplier },
        });
      } catch (err) {
        fastify.log.error(err, 'WS dart:submit error');
      }
    });

    // turn:undo — controller undoes last dart
    socket.on(C_TURN_UNDO, async () => {
      const { matchId } = socket.data;
      if (!matchId || socket.data.role !== 'controller') return;

      try {
        await fastify.inject({ method: 'POST', url: `/api/matches/${matchId}/undo` });
      } catch (err) {
        fastify.log.error(err, 'WS turn:undo error');
      }
    });

    // turn:skip — force-end current turn
    socket.on(C_TURN_SKIP, async () => {
      const { matchId } = socket.data;
      if (!matchId || socket.data.role !== 'controller') return;

      try {
        await fastify.inject({ method: 'POST', url: `/api/matches/${matchId}/skip` });
      } catch (err) {
        fastify.log.error(err, 'WS turn:skip error');
      }
    });

    socket.on(C_MATCH_SETUP, (setup) => {
      fastify.log.info(`[setup] WS match:setup:update received from ${socket.id}`);
      pushPendingMatchSetup(setup);
    });

    socket.on('disconnect', async () => {
      fastify.log.info(`WS disconnect: ${socket.id}`);
      if (socket.data.role === 'tv' && socket.data.matchId) {
        try { await fastify.inject({ method: 'POST', url: `/api/matches/${socket.data.matchId}/tv-leave` }); } catch (e) {}
      }
    });
  });
}

let pendingMatchSetup = null;
let liveNamespace = null;

export function getPendingMatchSetup() {
  return pendingMatchSetup;
}

export function pushPendingMatchSetup(setup) {
  pendingMatchSetup = setup ?? null;
  console.info('[setup] pushed match setup, broadcasting to live namespace, setup=', JSON.stringify(pendingMatchSetup)?.slice(0, 120));
  liveNamespace?.emit(S_MATCH_SETUP, pendingMatchSetup);
  return pendingMatchSetup;
}
