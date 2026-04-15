import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { Server as SocketIO } from 'socket.io';
import { openDb } from './db/connection.js';
import { setupRealtime } from './realtime/room.js';
import { setIo } from './realtime/io-instance.js';
import playerRoutes from './routes/players.js';
import matchRoutes from './routes/matches.js';
import statsRoutes from './routes/stats.js';
import catalogRoutes from './routes/catalog.js';
import importRoutes from './routes/imports.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 80);
const HOST = process.env.HOST ?? '0.0.0.0';

// ── Bootstrap DB ───────────────────────────────────────────────────────────
openDb();

// ── Fastify ────────────────────────────────────────────────────────────────
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
  },
});

await fastify.register(fastifyCors, { origin: '*' });

// Serve built web apps
const publicDir = join(__dirname, '..', 'public');
await fastify.register(fastifyStatic, { root: publicDir, prefix: '/' });

// Serve controller at root, TV at /tv, management at /manage
fastify.get('/', (_req, reply) => reply.sendFile('controller/index.html'));
fastify.get('/tv', (_req, reply) => reply.sendFile('tv/index.html'));
fastify.get('/manage', (_req, reply) => reply.sendFile('manage/index.html'));

// API routes
fastify.register(playerRoutes, { prefix: '/api/players' });
fastify.register(matchRoutes,  { prefix: '/api/matches' });
fastify.register(statsRoutes,  { prefix: '/api/stats' });
fastify.register(catalogRoutes, { prefix: '/api/catalog' });
fastify.register(importRoutes, { prefix: '/api/imports' });

// Health check
fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

// ── Start server & attach Socket.IO ───────────────────────────────────────
await fastify.ready();

const io = new SocketIO(fastify.server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 120000,
  transports: ['websocket', 'polling'],
});

setIo(io);
setupRealtime(io, fastify);

await fastify.listen({ port: PORT, host: HOST });
fastify.log.info(`DartsLeague running on http://${HOST}:${PORT}`);

// ── Graceful shutdown ──────────────────────────────────────────────────────
let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  fastify.log.info('Shutting down...');

  const forceExit = setTimeout(() => {
    fastify.log.warn('Forcing shutdown after timeout');
    process.exit(0);
  }, 5000);

  try {
    await new Promise((resolve) => io.close(resolve));
    await fastify.close();
  } finally {
    clearTimeout(forceExit);
    process.exit(0);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
