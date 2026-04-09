/**
 * Player routes — GET /players, POST /players, PATCH /players/:id,
 * DELETE /players/:id, GET /players/:id/stats
 */
import { getDb } from '../db/connection.js';
import { playerStats } from '../stats/aggregate.js';

export default async function playerRoutes(fastify) {
  const db = getDb();

  // GET /api/players
  fastify.get('/', async () => {
    return db
      .prepare('SELECT * FROM players WHERE archived_at IS NULL ORDER BY name')
      .all();
  });

  // POST /api/players
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name:  { type: 'string', minLength: 1, maxLength: 32 },
          color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          photo: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { name, color = '#e63946', photo = null } = req.body;

    try {
      const info = db
        .prepare('INSERT INTO players (name, nickname, color, photo) VALUES (?, ?, ?, ?)')
        .run(name, null, color, photo);

      const player = db
        .prepare('SELECT * FROM players WHERE id = ?')
        .get(info.lastInsertRowid);

      return reply.code(201).send(player);
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return reply.code(409).send({ error: { code: 'DUPLICATE_NAME', message: 'Player name already exists' } });
      }
      throw err;
    }
  });

  // PATCH /api/players/:id
  fastify.patch('/:id', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: {
        type: 'object',
        properties: {
          name:  { type: 'string', minLength: 1, maxLength: 32 },
          color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          photo: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const player = db.prepare('SELECT * FROM players WHERE id = ? AND archived_at IS NULL').get(id);
    if (!player) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Player not found' } });

    const { name, color, photo } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined)  { updates.push('name = ?');  values.push(name); }
    if (color !== undefined) { updates.push('color = ?'); values.push(color); }
    if (photo !== undefined) { updates.push('photo = ?'); values.push(photo); }
    if (updates.length === 0) return player;

    values.push(id);
    try {
      db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return reply.code(409).send({ error: { code: 'DUPLICATE_NAME', message: 'Player name already exists' } });
      }
      throw err;
    }

    return db.prepare('SELECT * FROM players WHERE id = ?').get(id);
  });

  // DELETE /api/players/:id  (soft delete)
  fastify.delete('/:id', {
    schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
  }, async (req, reply) => {
    const { id } = req.params;
    const player = db.prepare('SELECT * FROM players WHERE id = ? AND archived_at IS NULL').get(id);
    if (!player) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Player not found' } });

    db.prepare("UPDATE players SET archived_at = datetime('now') WHERE id = ?").run(id);
    return reply.code(204).send();
  });

  // GET /api/players/:id/stats
  fastify.get('/:id/stats', {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } } },
      querystring: {
        type: 'object',
        properties: {
          include_live: { type: 'integer', enum: [0, 1] },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const includeLive = req.query?.include_live === 1;
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
    if (!player) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Player not found' } });

    return playerStats(id, { includeLive });
  });
}
