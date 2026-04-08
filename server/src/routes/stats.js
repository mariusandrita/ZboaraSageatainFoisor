import { leaderboard, matchStats, lobbyData } from '../stats/aggregate.js';

export default async function statsRoutes(fastify) {
  // GET /api/stats/leaderboard
  fastify.get('/leaderboard', async () => leaderboard());

  // GET /api/stats/matches/:id
  fastify.get('/matches/:id', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
  }, async (req) => matchStats(req.params.id));

  // GET /api/stats/lobby
  fastify.get('/lobby', async () => lobbyData());
}
