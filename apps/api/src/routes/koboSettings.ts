import { FastifyPluginAsync } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { collections, koboSyncCollections, koboUserSettings } from "../db/schema";
import { getAuth, requireAuth } from "../auth/guards";
import { randomToken } from "../utils/hash";
import { nowIso } from "../utils/time";
import { ensureKoboSettingsRow } from "../services/koboSettings";
import { ensureSystemCollectionsForUser } from "../services/systemCollections";

const settingsSchema = z.object({
  syncEnabled: z.boolean(),
  syncAllBooks: z.boolean(),
  twoWayProgressSync: z.boolean(),
  markReadingThreshold: z.coerce.number().min(0).max(100),
  markFinishedThreshold: z.coerce.number().min(0).max(100),
  syncCollectionIds: z.array(z.coerce.number().int().positive())
});

export const koboSettingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/kobo/settings", { preHandler: requireAuth }, async (request) => {
    const { userId } = getAuth(request);
    await ensureSystemCollectionsForUser(userId);

    const settings = await ensureKoboSettingsRow(userId);
    const syncRows = await db
      .select({ collectionId: koboSyncCollections.collectionId })
      .from(koboSyncCollections)
      .innerJoin(
        collections,
        and(
          eq(collections.id, koboSyncCollections.collectionId),
          eq(collections.userId, userId)
        )
      )
      .where(eq(koboSyncCollections.userId, userId));

    return {
      token: settings.token,
      syncEnabled: Boolean(settings.syncEnabled),
      syncAllBooks: Boolean(settings.syncAllBooks),
      twoWayProgressSync: Boolean(settings.twoWayProgressSync),
      markReadingThreshold: settings.markReadingThreshold,
      markFinishedThreshold: settings.markFinishedThreshold,
      syncCollectionIds: syncRows.map((row) => row.collectionId)
    };
  });

  fastify.put("/api/v1/kobo/settings", { preHandler: requireAuth }, async (request, reply) => {
    const { userId } = getAuth(request);

    const body = settingsSchema.parse(request.body);
    await ensureSystemCollectionsForUser(userId);
    await ensureKoboSettingsRow(userId);

    const syncCollectionIds = [...new Set(body.syncCollectionIds)];
    if (syncCollectionIds.length > 0) {
      const validCollections = await db
        .select({ id: collections.id })
        .from(collections)
        .where(
          and(
            eq(collections.userId, userId),
            inArray(collections.id, syncCollectionIds)
          )
        );

      if (validCollections.length !== syncCollectionIds.length) {
        return reply
          .code(400)
          .send({ error: "One or more syncCollectionIds are invalid for this user" });
      }
    }

    await db.transaction((tx) => {
      tx
        .update(koboUserSettings)
        .set({
          syncEnabled: body.syncEnabled ? 1 : 0,
          syncAllBooks: body.syncAllBooks ? 1 : 0,
          twoWayProgressSync: body.twoWayProgressSync ? 1 : 0,
          markReadingThreshold: body.markReadingThreshold,
          markFinishedThreshold: body.markFinishedThreshold,
          updatedAt: nowIso()
        })
        .where(eq(koboUserSettings.userId, userId))
        .run();

      tx
        .delete(koboSyncCollections)
        .where(eq(koboSyncCollections.userId, userId))
        .run();

      if (syncCollectionIds.length > 0) {
        tx.insert(koboSyncCollections)
          .values(
            syncCollectionIds.map((collectionId) => ({
              userId,
              collectionId
            }))
          )
          .run();
      }
    });

    const [updated] = await db
      .select()
      .from(koboUserSettings)
      .where(eq(koboUserSettings.userId, userId))
      .limit(1);
    if (!updated) return reply.code(500).send({ error: "Could not update settings" });

    const syncRows = await db
      .select({ collectionId: koboSyncCollections.collectionId })
      .from(koboSyncCollections)
      .where(eq(koboSyncCollections.userId, userId));

    return {
      token: updated.token,
      syncEnabled: Boolean(updated.syncEnabled),
      syncAllBooks: Boolean(updated.syncAllBooks),
      twoWayProgressSync: Boolean(updated.twoWayProgressSync),
      markReadingThreshold: updated.markReadingThreshold,
      markFinishedThreshold: updated.markFinishedThreshold,
      syncCollectionIds: syncRows.map((row) => row.collectionId)
    };
  });

  fastify.put(
    "/api/v1/kobo/settings/token",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);

      await ensureKoboSettingsRow(userId);
      const [updated] = await db
        .update(koboUserSettings)
        .set({ token: randomToken(), updatedAt: nowIso() })
        .where(eq(koboUserSettings.userId, userId))
        .returning();

      if (!updated) return reply.code(500).send({ error: "Could not regenerate token" });

      const syncRows = await db
        .select({ collectionId: koboSyncCollections.collectionId })
        .from(koboSyncCollections)
        .where(eq(koboSyncCollections.userId, userId));

      return {
        token: updated.token,
        syncEnabled: Boolean(updated.syncEnabled),
        syncAllBooks: Boolean(updated.syncAllBooks),
        twoWayProgressSync: Boolean(updated.twoWayProgressSync),
        markReadingThreshold: updated.markReadingThreshold,
        markFinishedThreshold: updated.markFinishedThreshold,
        syncCollectionIds: syncRows.map((row) => row.collectionId)
      };
    }
  );
};
