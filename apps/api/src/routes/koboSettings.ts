import { FastifyPluginAsync } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { collections, koboSyncCollections, koboUserSettings } from "../db/schema";
import { requireAuth } from "../auth/guards";
import { randomToken } from "../utils/hash";
import { nowIso } from "../utils/time";
import { ensureSystemCollectionsForUser } from "../services/systemCollections";

const settingsSchema = z.object({
  syncEnabled: z.boolean(),
  twoWayProgressSync: z.boolean(),
  markReadingThreshold: z.coerce.number().min(0).max(100),
  markFinishedThreshold: z.coerce.number().min(0).max(100),
  syncCollectionIds: z.array(z.coerce.number().int().positive())
});

const ensureSettingsRow = async (userId: number) => {
  const found = await db
    .select()
    .from(koboUserSettings)
    .where(eq(koboUserSettings.userId, userId))
    .limit(1);

  if (found[0]) return found[0];

  const [inserted] = await db
    .insert(koboUserSettings)
    .values({
      userId,
      token: randomToken(),
      syncEnabled: 0,
      twoWayProgressSync: 0,
      markReadingThreshold: 1,
      markFinishedThreshold: 99,
      updatedAt: nowIso()
    })
    .returning();

  return inserted;
};

export const koboSettingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/kobo/settings", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });
    await ensureSystemCollectionsForUser(request.auth.userId);

    const settings = await ensureSettingsRow(request.auth.userId);
    const syncRows = await db
      .select({ collectionId: koboSyncCollections.collectionId })
      .from(koboSyncCollections)
      .innerJoin(
        collections,
        and(
          eq(collections.id, koboSyncCollections.collectionId),
          eq(collections.userId, request.auth.userId)
        )
      )
      .where(eq(koboSyncCollections.userId, request.auth.userId));

    return {
      token: settings.token,
      syncEnabled: Boolean(settings.syncEnabled),
      twoWayProgressSync: Boolean(settings.twoWayProgressSync),
      markReadingThreshold: settings.markReadingThreshold,
      markFinishedThreshold: settings.markFinishedThreshold,
      syncCollectionIds: syncRows.map((row) => row.collectionId)
    };
  });

  fastify.put("/api/v1/kobo/settings", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });

    const body = settingsSchema.parse(request.body);
    await ensureSystemCollectionsForUser(request.auth.userId);
    await ensureSettingsRow(request.auth.userId);

    const syncCollectionIds = [...new Set(body.syncCollectionIds)];
    if (syncCollectionIds.length > 0) {
      const validCollections = await db
        .select({ id: collections.id })
        .from(collections)
        .where(
          and(
            eq(collections.userId, request.auth.userId),
            inArray(collections.id, syncCollectionIds)
          )
        );

      if (validCollections.length !== syncCollectionIds.length) {
        return reply
          .code(400)
          .send({ error: "One or more syncCollectionIds are invalid for this user" });
      }
    }

    db.transaction((tx) => {
      tx
        .update(koboUserSettings)
        .set({
          syncEnabled: body.syncEnabled ? 1 : 0,
          twoWayProgressSync: body.twoWayProgressSync ? 1 : 0,
          markReadingThreshold: body.markReadingThreshold,
          markFinishedThreshold: body.markFinishedThreshold,
          updatedAt: nowIso()
        })
        .where(eq(koboUserSettings.userId, request.auth!.userId))
        .run();

      tx
        .delete(koboSyncCollections)
        .where(eq(koboSyncCollections.userId, request.auth!.userId))
        .run();

      if (syncCollectionIds.length > 0) {
        tx.insert(koboSyncCollections)
          .values(
            syncCollectionIds.map((collectionId) => ({
              userId: request.auth!.userId,
              collectionId
            }))
          )
          .run();
      }
    });

    const [updated] = await db
      .select()
      .from(koboUserSettings)
      .where(eq(koboUserSettings.userId, request.auth.userId))
      .limit(1);
    if (!updated) return reply.code(500).send({ error: "Could not update settings" });

    const syncRows = await db
      .select({ collectionId: koboSyncCollections.collectionId })
      .from(koboSyncCollections)
      .where(eq(koboSyncCollections.userId, request.auth.userId));

    return {
      token: updated.token,
      syncEnabled: Boolean(updated.syncEnabled),
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
      if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });

      await ensureSettingsRow(request.auth.userId);
      const [updated] = await db
        .update(koboUserSettings)
        .set({ token: randomToken(), updatedAt: nowIso() })
        .where(eq(koboUserSettings.userId, request.auth.userId))
        .returning();

      if (!updated) return reply.code(500).send({ error: "Could not regenerate token" });

      const syncRows = await db
        .select({ collectionId: koboSyncCollections.collectionId })
        .from(koboSyncCollections)
        .where(eq(koboSyncCollections.userId, request.auth.userId));

      return {
        token: updated.token,
        syncEnabled: Boolean(updated.syncEnabled),
        twoWayProgressSync: Boolean(updated.twoWayProgressSync),
        markReadingThreshold: updated.markReadingThreshold,
        markFinishedThreshold: updated.markFinishedThreshold,
        syncCollectionIds: syncRows.map((row) => row.collectionId)
      };
    }
  );
};
