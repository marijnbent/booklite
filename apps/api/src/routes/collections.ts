import { FastifyPluginAsync } from "fastify";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { collectionBooks, collections } from "../db/schema";
import { requireAuth } from "../auth/guards";
import { nowIso } from "../utils/time";
import { ensureSystemCollectionsForUser } from "../services/systemCollections";

const createCollectionSchema = z.object({
  name: z.string().min(1),
  icon: z.string().nullable().optional()
});

const patchCollectionSchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().nullable().optional()
});

const reorderSchema = z.object({
  collectionId: z.number().int().positive(),
  bookIds: z.array(z.number().int().positive())
});

export const collectionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/collections", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });
    await ensureSystemCollectionsForUser(request.auth.userId);

    return db.all(sql`
      SELECT c.*, COUNT(cb.book_id) AS book_count
      FROM collections c
      LEFT JOIN collection_books cb ON cb.collection_id = c.id
      WHERE c.user_id = ${request.auth.userId}
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `);
  });

  fastify.post(
    "/api/v1/collections",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });
      await ensureSystemCollectionsForUser(request.auth.userId);
      const body = createCollectionSchema.parse(request.body);
      const timestamp = nowIso();

      const [created] = await db
        .insert(collections)
        .values({
          userId: request.auth.userId,
          name: body.name,
          icon: body.icon ?? null,
          slug: null,
          isSystem: 0,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .returning();

      return reply.code(201).send(created);
    }
  );

  fastify.patch(
    "/api/v1/collections/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });
      await ensureSystemCollectionsForUser(request.auth.userId);
      const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
      const body = patchCollectionSchema.parse(request.body);

      const existing = await db
        .select({ id: collections.id, isSystem: collections.isSystem })
        .from(collections)
        .where(and(eq(collections.id, params.id), eq(collections.userId, request.auth.userId)))
        .limit(1);

      if (!existing[0]) return reply.code(404).send({ error: "Collection not found" });
      if (existing[0].isSystem === 1) {
        return reply.code(400).send({ error: "System collections cannot be renamed or edited" });
      }

      const set: Record<string, unknown> = { updatedAt: nowIso() };
      if (body.name !== undefined) set.name = body.name;
      if (body.icon !== undefined) set.icon = body.icon;

      const [updated] = await db
        .update(collections)
        .set(set)
        .where(and(eq(collections.id, params.id), eq(collections.userId, request.auth.userId)))
        .returning();

      if (!updated) return reply.code(404).send({ error: "Collection not found" });
      return updated;
    }
  );

  fastify.delete(
    "/api/v1/collections/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });
      await ensureSystemCollectionsForUser(request.auth.userId);
      const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);

      const found = await db
        .select({ id: collections.id, isSystem: collections.isSystem })
        .from(collections)
        .where(and(eq(collections.id, params.id), eq(collections.userId, request.auth.userId)))
        .limit(1);
      if (!found[0]) return reply.code(404).send({ error: "Collection not found" });
      if (found[0].isSystem === 1) {
        return reply.code(400).send({ error: "System collections cannot be deleted" });
      }

      await db
        .delete(collections)
        .where(and(eq(collections.id, params.id), eq(collections.userId, request.auth.userId)));

      return reply.code(204).send();
    }
  );

  fastify.post(
    "/api/v1/collections/:id/books/:bookId",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });
      await ensureSystemCollectionsForUser(request.auth.userId);
      const params = z
        .object({
          id: z.coerce.number().int().positive(),
          bookId: z.coerce.number().int().positive()
        })
        .parse(request.params);

      const collectionExists = await db
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.id, params.id), eq(collections.userId, request.auth.userId)))
        .limit(1);

      if (!collectionExists[0]) {
        return reply.code(404).send({ error: "Collection not found" });
      }

      const maxSort = await db
        .select({ maxSort: sql<number>`COALESCE(MAX(${collectionBooks.sortOrder}), 0)` })
        .from(collectionBooks)
        .where(eq(collectionBooks.collectionId, params.id));

      await db
        .insert(collectionBooks)
        .values({
          collectionId: params.id,
          bookId: params.bookId,
          sortOrder: (maxSort[0]?.maxSort ?? 0) + 1
        })
        .onConflictDoNothing();

      await db
        .update(collections)
        .set({ updatedAt: nowIso() })
        .where(eq(collections.id, params.id));

      return { ok: true };
    }
  );

  fastify.delete(
    "/api/v1/collections/:id/books/:bookId",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });
      await ensureSystemCollectionsForUser(request.auth.userId);
      const params = z
        .object({
          id: z.coerce.number().int().positive(),
          bookId: z.coerce.number().int().positive()
        })
        .parse(request.params);

      await db
        .delete(collectionBooks)
        .where(
          and(
            eq(collectionBooks.collectionId, params.id),
            eq(collectionBooks.bookId, params.bookId)
          )
        );

      await db
        .update(collections)
        .set({ updatedAt: nowIso() })
        .where(and(eq(collections.id, params.id), eq(collections.userId, request.auth.userId)));

      return reply.code(204).send();
    }
  );

  fastify.post(
    "/api/v1/collections/reorder",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });
      await ensureSystemCollectionsForUser(request.auth.userId);
      const body = reorderSchema.parse(request.body);

      const found = await db
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.id, body.collectionId), eq(collections.userId, request.auth.userId)))
        .limit(1);
      if (!found[0]) return reply.code(404).send({ error: "Collection not found" });

      let i = 0;
      for (const bookId of body.bookIds) {
        await db
          .update(collectionBooks)
          .set({ sortOrder: i })
          .where(
            and(
              eq(collectionBooks.collectionId, body.collectionId),
              eq(collectionBooks.bookId, bookId)
            )
          );
        i += 1;
      }

      await db
        .update(collections)
        .set({ updatedAt: nowIso() })
        .where(eq(collections.id, body.collectionId));

      return { ok: true };
    }
  );

  fastify.get(
    "/api/v1/collections/:id/books",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });
      await ensureSystemCollectionsForUser(request.auth.userId);
      const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);

      return db.all(sql`
        SELECT b.*, cb.sort_order
        FROM collection_books cb
        JOIN collections c ON c.id = cb.collection_id
        JOIN books b ON b.id = cb.book_id
        WHERE c.user_id = ${request.auth.userId} AND c.id = ${params.id}
        ORDER BY cb.sort_order ASC
      `);
    }
  );
};
