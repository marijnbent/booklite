import { FastifyPluginAsync } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { koboUserSettings } from "../db/schema";
import { requireAuth } from "../auth/guards";
import { randomToken } from "../utils/hash";
import { nowIso } from "../utils/time";

const settingsSchema = z.object({
  syncEnabled: z.boolean(),
  twoWayProgressSync: z.boolean(),
  markReadingThreshold: z.coerce.number().min(0).max(100),
  markFinishedThreshold: z.coerce.number().min(0).max(100)
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

    const settings = await ensureSettingsRow(request.auth.userId);
    return {
      token: settings.token,
      syncEnabled: Boolean(settings.syncEnabled),
      twoWayProgressSync: Boolean(settings.twoWayProgressSync),
      markReadingThreshold: settings.markReadingThreshold,
      markFinishedThreshold: settings.markFinishedThreshold
    };
  });

  fastify.put("/api/v1/kobo/settings", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });

    const body = settingsSchema.parse(request.body);

    const [updated] = await db
      .update(koboUserSettings)
      .set({
        syncEnabled: body.syncEnabled ? 1 : 0,
        twoWayProgressSync: body.twoWayProgressSync ? 1 : 0,
        markReadingThreshold: body.markReadingThreshold,
        markFinishedThreshold: body.markFinishedThreshold,
        updatedAt: nowIso()
      })
      .where(eq(koboUserSettings.userId, request.auth.userId))
      .returning();

    if (!updated) {
      const inserted = await ensureSettingsRow(request.auth.userId);
      return {
        token: inserted.token,
        syncEnabled: Boolean(inserted.syncEnabled),
        twoWayProgressSync: Boolean(inserted.twoWayProgressSync),
        markReadingThreshold: inserted.markReadingThreshold,
        markFinishedThreshold: inserted.markFinishedThreshold
      };
    }

    return {
      token: updated.token,
      syncEnabled: Boolean(updated.syncEnabled),
      twoWayProgressSync: Boolean(updated.twoWayProgressSync),
      markReadingThreshold: updated.markReadingThreshold,
      markFinishedThreshold: updated.markFinishedThreshold
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

      return {
        token: updated.token,
        syncEnabled: Boolean(updated.syncEnabled),
        twoWayProgressSync: Boolean(updated.twoWayProgressSync),
        markReadingThreshold: updated.markReadingThreshold,
        markFinishedThreshold: updated.markFinishedThreshold
      };
    }
  );
};
