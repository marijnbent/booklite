import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { collections, koboSyncCollections, users } from "../db/schema";
import { nowIso } from "../utils/time";

const FAVORITES_NAME = "Favorites";
const FAVORITES_SLUG = "favorites";

export const ensureFavoritesCollection = async (
  userId: number,
  input?: { preselectForKobo?: boolean }
): Promise<number> => {
  const timestamp = nowIso();

  const bySlug = await db
    .select({
      id: collections.id,
      name: collections.name,
      isSystem: collections.isSystem
    })
    .from(collections)
    .where(and(eq(collections.userId, userId), eq(collections.slug, FAVORITES_SLUG)))
    .limit(1);

  let favoritesId = bySlug[0]?.id ?? 0;

  if (favoritesId) {
    if (bySlug[0].name !== FAVORITES_NAME || bySlug[0].isSystem !== 1) {
      await db
        .update(collections)
        .set({ name: FAVORITES_NAME, isSystem: 1, updatedAt: timestamp })
        .where(eq(collections.id, favoritesId));
    }
  } else {
    const byName = await db.all<{ id: number }>(
      sql`SELECT id FROM collections WHERE user_id = ${userId} AND lower(name) = lower(${FAVORITES_NAME}) ORDER BY id ASC LIMIT 1`
    );

    if (byName[0]) {
      favoritesId = byName[0].id;
      await db
        .update(collections)
        .set({
          name: FAVORITES_NAME,
          slug: FAVORITES_SLUG,
          isSystem: 1,
          updatedAt: timestamp
        })
        .where(eq(collections.id, favoritesId));
    } else {
      const [created] = await db
        .insert(collections)
        .values({
          userId,
          name: FAVORITES_NAME,
          icon: null,
          slug: FAVORITES_SLUG,
          isSystem: 1,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .returning({ id: collections.id });

      favoritesId = created.id;
    }
  }

  if (input?.preselectForKobo) {
    await db
      .insert(koboSyncCollections)
      .values({ userId, collectionId: favoritesId })
      .onConflictDoNothing();
  }

  return favoritesId;
};

export const getFavoritesCollectionId = async (userId: number): Promise<number> =>
  ensureFavoritesCollection(userId);

export const ensureSystemCollectionsForUser = async (
  userId: number,
  input?: { preselectFavoritesForKobo?: boolean }
): Promise<void> => {
  await ensureFavoritesCollection(userId, {
    preselectForKobo: input?.preselectFavoritesForKobo ?? false
  });
};

export const ensureSystemCollectionsForAllUsers = async (): Promise<void> => {
  const allUsers = await db.select({ id: users.id }).from(users);
  for (const row of allUsers) {
    await ensureSystemCollectionsForUser(row.id);
  }
};
