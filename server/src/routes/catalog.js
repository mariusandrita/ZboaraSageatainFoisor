import { mkdir, readdir, rm, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import {
  BADGE_ASSET_DIR,
  BADGE_ASSET_EXTENSIONS,
  BADGE_CATALOG,
  CELEBRATION_CATALOG,
  EXPERIMENTAL_CELEBRATION_IDEAS,
  listBadgeAssets,
  preferredBadgeAssetFile,
  sortBadgesByPriority,
} from '../catalog.js';

export default async function catalogRoutes(fastify) {
  fastify.get('/management', async () => {
    const badgeAssets = listBadgeAssets();

    return {
      badgeAssetDir: BADGE_ASSET_DIR,
      badgeAssetExtensions: BADGE_ASSET_EXTENSIONS,
      badges: sortBadgesByPriority(BADGE_CATALOG).map((badge) => {
        const files = badgeAssets.get(badge.kind) ?? [];
        const preferredFile = preferredBadgeAssetFile(files);

        return {
          ...badge,
          files,
          hasCustomImage: files.length > 0,
          customImageUrl: preferredFile ? `/assets/badges/${preferredFile}` : null,
        };
      }),
      celebrations: CELEBRATION_CATALOG,
      experimentalCelebrations: EXPERIMENTAL_CELEBRATION_IDEAS,
    };
  });

  fastify.post('/badges/:kind/image', {
    config: {
      bodyLimit: 10 * 1024 * 1024,
    },
    schema: {
      params: {
        type: 'object',
        required: ['kind'],
        properties: {
          kind: { type: 'string', minLength: 1 },
        },
      },
      body: {
        type: 'object',
        required: ['imageBase64'],
        properties: {
          imageBase64: { type: 'string', minLength: 32 },
        },
      },
    },
  }, async (req, reply) => {
    const { kind } = req.params;
    const { imageBase64 } = req.body;
    const badge = BADGE_CATALOG.find((item) => item.kind === kind);

    if (!badge) {
      return reply.code(404).send({ error: { code: 'BADGE_NOT_FOUND', message: 'Badge kind not found' } });
    }

    const match = imageBase64.match(/^data:image\/png;base64,(.+)$/);
    if (!match) {
      return reply.code(400).send({ error: { code: 'INVALID_IMAGE', message: 'Expected a PNG data URI payload' } });
    }

    const buffer = Buffer.from(match[1], 'base64');
    if (!buffer.length) {
      return reply.code(400).send({ error: { code: 'INVALID_IMAGE', message: 'Image payload is empty' } });
    }

    await mkdir(BADGE_ASSET_DIR, { recursive: true });

    const existingFiles = await readdir(BADGE_ASSET_DIR);
    await Promise.all(existingFiles
      .filter((file) => {
        const ext = extname(file).toLowerCase();
        return BADGE_ASSET_EXTENSIONS.includes(ext) && file.slice(0, -ext.length) === kind;
      })
      .map((file) => rm(join(BADGE_ASSET_DIR, file), { force: true })));

    const filename = `${kind}.png`;
    await writeFile(join(BADGE_ASSET_DIR, filename), buffer);

    return {
      ok: true,
      kind,
      file: filename,
      customImageUrl: `/assets/badges/${filename}?v=${Date.now()}`,
    };
  });
}
