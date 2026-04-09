import {
  BADGE_ASSET_DIR,
  BADGE_ASSET_EXTENSIONS,
  BADGE_CATALOG,
  CELEBRATION_CATALOG,
  EXPERIMENTAL_CELEBRATION_IDEAS,
  listBadgeAssets,
} from '../catalog.js';

export default async function catalogRoutes(fastify) {
  fastify.get('/management', async () => {
    const badgeAssets = listBadgeAssets();

    return {
      badgeAssetDir: BADGE_ASSET_DIR,
      badgeAssetExtensions: BADGE_ASSET_EXTENSIONS,
      badges: BADGE_CATALOG.map((badge) => {
        const files = badgeAssets.get(badge.kind) ?? [];
        const preferredFile = files[0] ?? null;

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
}
