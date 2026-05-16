import { getDb } from '../db/connection.js';
import { defaultProdartsDir, getProdartsImportStatus, importProdartsX01 } from '../import/prodarts.js';

export default async function importRoutes(fastify) {
  const db = getDb();

  fastify.get('/prodarts/status', async () => {
    return {
      prodartsDir: defaultProdartsDir(),
      ...getProdartsImportStatus(db),
    };
  });

  fastify.post('/prodarts/run', async () => {
    const summary = importProdartsX01({ db, prodartsDir: defaultProdartsDir() });
    return {
      ok: true,
      summary,
      status: getProdartsImportStatus(db),
    };
  });
}
