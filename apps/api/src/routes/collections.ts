import { FastifyPluginAsync } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { collectionBooks, collections } from "../db/schema";
import { getAuth, requireAuth } from "../auth/guards";
import { idParams } from "../schemas";
import { nowIso } from "../utils/time";
import { ensureSystemCollectionsForUser } from "../services/systemCollections";
import { bookJoins, bookSelectFields, bookVisibleToUserWhere, mapBookRow } from "./books";

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

const listCollectionsSchema = z.object({
  includeVirtual: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional()
});

const SHARED_WITH_ME_COLLECTION_ID = -2;
const UNCOLLECTED_COLLECTION_ID = -1;

export const collectionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/collections", { preHandler: requireAuth }, async (request) => {
    const { userId } = getAuth(request);
    await ensureSystemCollectionsForUser(userId);

    const query = listCollectionsSchema.parse(request.query);
    const includeVirtual =
      query.includeVirtual === "1" || query.includeVirtual === "true";

    const rows = await db.all(sql`
      SELECT
        c.*,
        COUNT(b.id) AS book_count,
        COALESCE(
          SUM(
            CASE
              WHEN lower(b.file_ext) IN ('epub', 'kepub') THEN 1
              ELSE 0
            END
          ),
          0
        ) AS kobo_syncable_count
      FROM collections c
      LEFT JOIN collection_books cb ON cb.collection_id = c.id
      LEFT JOIN books b ON b.id = cb.book_id AND ${bookVisibleToUserWhere(userId)}
      WHERE c.user_id = ${userId}
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `);

    if (!includeVirtual) {
      return rows;
    }

    const uncollectedRows = await db.all<{ book_count: number; kobo_syncable_count: number }>(sql`
      SELECT
        COUNT(*) AS book_count,
        COALESCE(
          SUM(
            CASE
              WHEN lower(b.file_ext) IN ('epub', 'kepub') THEN 1
              ELSE 0
            END
          ),
          0
        ) AS kobo_syncable_count
      FROM books b
      WHERE ${bookVisibleToUserWhere(userId)}
        AND NOT EXISTS (
        SELECT 1
        FROM collection_books cb
        INNER JOIN collections c ON c.id = cb.collection_id
        WHERE cb.book_id = b.id
          AND c.user_id = ${userId}
      )
    `);

    const sharedWithMeRows = await db.all<{ book_count: number; kobo_syncable_count: number }>(sql`
      SELECT
        COUNT(*) AS book_count,
        COALESCE(
          SUM(
            CASE
              WHEN lower(b.file_ext) IN ('epub', 'kepub') THEN 1
              ELSE 0
            END
          ),
          0
        ) AS kobo_syncable_count
      FROM books b
      WHERE b.owner_user_id != ${userId}
        AND EXISTS (
          SELECT 1
          FROM book_shares bs
          WHERE bs.book_id = b.id
            AND bs.recipient_user_id = ${userId}
            AND bs.removed_at IS NULL
        )
    `);

    return [
      ...rows,
      {
        id: SHARED_WITH_ME_COLLECTION_ID,
        user_id: userId,
        name: "Shared with me",
        icon: null,
        slug: "shared-with-me",
        is_system: 1,
        created_at: "",
        updated_at: "",
        book_count: sharedWithMeRows[0]?.book_count ?? 0,
        kobo_syncable_count: sharedWithMeRows[0]?.kobo_syncable_count ?? 0,
        virtual: 1
      },
      {
        id: UNCOLLECTED_COLLECTION_ID,
        user_id: userId,
        name: "Uncollected",
        icon: null,
        slug: "uncollected",
        is_system: 1,
        created_at: "",
        updated_at: "",
        book_count: uncollectedRows[0]?.book_count ?? 0,
        kobo_syncable_count: uncollectedRows[0]?.kobo_syncable_count ?? 0,
        virtual: 1
      }
    ];
  });

  fastify.post(
    "/api/v1/collections",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);
      await ensureSystemCollectionsForUser(userId);
      const body = createCollectionSchema.parse(request.body);
      const timestamp = nowIso();

      const [created] = await db
        .insert(collections)
        .values({
          userId,
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
      const { userId } = getAuth(request);
      await ensureSystemCollectionsForUser(userId);
      const params = idParams.parse(request.params);
      const body = patchCollectionSchema.parse(request.body);

      const existing = await db
        .select({ id: collections.id, isSystem: collections.isSystem })
        .from(collections)
        .where(and(eq(collections.id, params.id), eq(collections.userId, userId)))
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
        .where(and(eq(collections.id, params.id), eq(collections.userId, userId)))
        .returning();

      if (!updated) return reply.code(404).send({ error: "Collection not found" });
      return updated;
    }
  );

  fastify.delete(
    "/api/v1/collections/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);
      await ensureSystemCollectionsForUser(userId);
      const params = idParams.parse(request.params);

      const found = await db
        .select({ id: collections.id, isSystem: collections.isSystem })
        .from(collections)
        .where(and(eq(collections.id, params.id), eq(collections.userId, userId)))
        .limit(1);
      if (!found[0]) return reply.code(404).send({ error: "Collection not found" });
      if (found[0].isSystem === 1) {
        return reply.code(400).send({ error: "System collections cannot be deleted" });
      }

      await db
        .delete(collections)
        .where(and(eq(collections.id, params.id), eq(collections.userId, userId)));

      return reply.code(204).send();
    }
  );

  fastify.post(
    "/api/v1/collections/:id/books/:bookId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);
      await ensureSystemCollectionsForUser(userId);
      const params = z
        .object({
          id: z.coerce.number().int().positive(),
          bookId: z.coerce.number().int().positive()
        })
        .parse(request.params);

      const collectionExists = await db
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.id, params.id), eq(collections.userId, userId)))
        .limit(1);

      if (!collectionExists[0]) {
        return reply.code(404).send({ error: "Collection not found" });
      }

      const visibleBook = await db.all<{ id: number }>(sql`
        SELECT b.id
        FROM books b
        WHERE b.id = ${params.bookId}
          AND ${bookVisibleToUserWhere(userId)}
        LIMIT 1
      `);
      if (!visibleBook[0]) {
        return reply.code(404).send({ error: "Book not found" });
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
      const { userId } = getAuth(request);
      await ensureSystemCollectionsForUser(userId);
      const params = z
        .object({
          id: z.coerce.number().int().positive(),
          bookId: z.coerce.number().int().positive()
        })
        .parse(request.params);

      const collectionExists = await db
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.id, params.id), eq(collections.userId, userId)))
        .limit(1);

      if (!collectionExists[0]) {
        return reply.code(404).send({ error: "Collection not found" });
      }

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
        .where(and(eq(collections.id, params.id), eq(collections.userId, userId)));

      return reply.code(204).send();
    }
  );

  fastify.post(
    "/api/v1/collections/reorder",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);
      await ensureSystemCollectionsForUser(userId);
      const body = reorderSchema.parse(request.body);

      const found = await db
        .select({ id: collections.id })
        .from(collections)
        .where(and(eq(collections.id, body.collectionId), eq(collections.userId, userId)))
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
    "/api/v1/collections/shared-with-me/books",
    { preHandler: requireAuth },
    async (request) => {
      const { userId } = getAuth(request);
      await ensureSystemCollectionsForUser(userId);

      const rows = await db.all(sql`
        SELECT ${bookSelectFields(userId)}
        FROM books b
        ${bookJoins(userId)}
        WHERE b.owner_user_id != ${userId}
          AND EXISTS (
            SELECT 1
            FROM book_shares bs
            WHERE bs.book_id = b.id
              AND bs.recipient_user_id = ${userId}
              AND bs.removed_at IS NULL
          )
        ORDER BY b.updated_at DESC
      `);

      return rows.map(mapBookRow);
    }
  );

  fastify.get(
    "/api/v1/collections/uncollected/books",
    { preHandler: requireAuth },
    async (request) => {
      const { userId } = getAuth(request);
      await ensureSystemCollectionsForUser(userId);

      const rows = await db.all(sql`
        SELECT ${bookSelectFields(userId)}
        FROM books b
        ${bookJoins(userId)}
        WHERE ${bookVisibleToUserWhere(userId)}
          AND NOT EXISTS (
          SELECT 1
          FROM collection_books cb2
          INNER JOIN collections c2 ON c2.id = cb2.collection_id
          WHERE cb2.book_id = b.id
            AND c2.user_id = ${userId}
        )
        ORDER BY b.updated_at DESC
      `);

      return rows.map(mapBookRow);
    }
  );

  fastify.get(
    "/api/v1/collections/:id/books",
    { preHandler: requireAuth },
    async (request) => {
      const { userId } = getAuth(request);
      await ensureSystemCollectionsForUser(userId);
      const params = idParams.parse(request.params);

      const rows = await db.all(sql`
        SELECT ${bookSelectFields(userId)}, cb.sort_order
        FROM collection_books cb
        JOIN collections c ON c.id = cb.collection_id
        JOIN books b ON b.id = cb.book_id AND ${bookVisibleToUserWhere(userId)}
        ${bookJoins(userId)}
        WHERE c.user_id = ${userId} AND c.id = ${params.id}
        ORDER BY cb.sort_order ASC
      `);
      return rows.map(mapBookRow);
    }
  );
};
