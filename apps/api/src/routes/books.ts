import path from "node:path";
import fs from "node:fs";
import { READ_STATUSES } from "@booklite/shared";
import { FastifyPluginAsync } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { bookProgress, books, collectionBooks, collections } from "../db/schema";
import { getAuth, requireAuth } from "../auth/guards";
import { config } from "../config";
import { idParams } from "../schemas";
import { nowIso } from "../utils/time";
import { fetchMetadataWithFallback } from "../services/metadata";
import { resolveFilenameMetadata } from "../services/filenameNormalizer";
import { logAdminActivity } from "../services/adminActivityLog";
import { applyDownloadHeaders } from "../services/downloadHeaders";
import {
  deleteManagedCoverIfPresent,
  resolveManagedCoverPath,
  resolveStoredCoverPathForWrite,
  serializeBookCoverPath
} from "../services/coverAssets";
import { verifyAccessToken } from "../auth/jwt";
import {
  getKoboThresholdsForUser,
  inferStatusFromProgress
} from "../services/koboSettings";
import {
  ensureSystemCollectionsForUser,
  getFavoritesCollectionId
} from "../services/systemCollections";

const patchBookSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().nullable().optional(),
  series: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  coverPath: z.string().nullable().optional(),
  status: z.enum(READ_STATUSES).optional(),
  progressPercent: z.coerce.number().min(0).max(100).optional(),
  positionRef: z.string().nullable().optional()
});

const updateBookCollectionsSchema = z.object({
  collectionIds: z.array(z.coerce.number().int().positive())
});

const favoriteSchema = z.object({
  favorite: z.boolean()
});

const coverQuerySchema = z.object({
  token: z.string().min(1).optional(),
  v: z.string().optional()
});

export const mapBookRow = (row: any) => ({
  id: row.id,
  ownerUserId: row.owner_user_id,
  title: row.title,
  author: row.author,
  series: row.series,
  description: row.description,
  coverPath: serializeBookCoverPath(row.id, row.cover_path, row.updated_at),
  filePath: row.file_path,
  fileExt: row.file_ext,
  fileSize: row.file_size,
  koboSyncable: row.kobo_syncable,
  isFavorite: row.is_favorite === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  progress:
    row.progress_status === null
      ? null
      : {
          status: row.progress_status,
          progressPercent: row.progress_percent,
          positionRef: row.position_ref,
          updatedAt: row.progress_updated_at
        }
});

export const koboSyncableCase = (userId: number) => sql`
  CASE
    WHEN lower(b.file_ext) IN ('epub', 'kepub') AND (
      EXISTS (
        SELECT 1 FROM kobo_user_settings kus
        WHERE kus.user_id = ${userId} AND kus.sync_enabled = 1 AND kus.sync_all_books = 1
      )
      OR EXISTS (
        SELECT 1
        FROM kobo_sync_collections ksc
        INNER JOIN collections kc ON kc.id = ksc.collection_id
        INNER JOIN collection_books kcb ON kcb.collection_id = kc.id
        WHERE ksc.user_id = ${userId}
          AND kc.user_id = ${userId}
          AND kcb.book_id = b.id
      )
    ) THEN 1
    ELSE 0
  END
`;

export const bookSelectFields = (userId: number) => sql`
  b.id,
  b.owner_user_id,
  b.title,
  b.author,
  b.series,
  b.description,
  b.cover_path,
  b.file_path,
  b.file_ext,
  b.file_size,
  ${koboSyncableCase(userId)} AS kobo_syncable,
  b.created_at,
  b.updated_at,
  bp.status AS progress_status,
  bp.progress_percent,
  bp.position_ref,
  bp.updated_at AS progress_updated_at,
  CASE WHEN fav_cb.book_id IS NULL THEN 0 ELSE 1 END AS is_favorite
`;

export const bookJoins = (userId: number) => sql`
  LEFT JOIN book_progress bp ON bp.book_id = b.id AND bp.user_id = ${userId}
  LEFT JOIN collections fav ON fav.user_id = ${userId} AND fav.slug = 'favorites'
  LEFT JOIN collection_books fav_cb ON fav_cb.collection_id = fav.id AND fav_cb.book_id = b.id
`;

type BookMetadataRefreshTarget = {
  id: number;
  title: string;
  author: string | null;
  series: string | null;
  description: string | null;
  coverPath: string | null;
  filePath: string;
};

const refreshBookMetadata = async (
  target: BookMetadataRefreshTarget
): Promise<{ source: string; updated: boolean }> => {
  const metadata = await fetchMetadataWithFallback(target.title, target.author ?? undefined);

  if (metadata.source === "NONE") {
    const fallback = await resolveFilenameMetadata(path.basename(target.filePath));
    const title = fallback.title || target.title;
    const author =
      target.author && target.author.trim().length > 0 ? target.author : fallback.author;

    const changed = title !== target.title || author !== target.author;
    if (changed) {
      await db
        .update(books)
        .set({
          title,
          author,
          updatedAt: nowIso()
        })
        .where(eq(books.id, target.id));
    }

    return { source: "NONE", updated: changed };
  }

  const nextTitle = metadata.title ?? target.title;
  const nextAuthor = metadata.author ?? target.author;
  const nextSeries = metadata.series ?? target.series ?? null;
  const nextDescription = metadata.description ?? null;
  let nextCoverPath = metadata.coverPath ?? null;

  if (metadata.coverPath) {
    try {
      nextCoverPath = await resolveStoredCoverPathForWrite({
        bookId: target.id,
        coverPath: metadata.coverPath,
        currentStoredCoverPath: target.coverPath
      });
    } catch (error) {
      await logAdminActivity({
        scope: "metadata",
        event: "metadata.cover_localization_failed",
        level: "WARN",
        message: "Metadata refresh cover localization failed",
        bookId: target.id,
        details: {
          title: target.title,
          author: target.author,
          requestedCoverPath: metadata.coverPath,
          error
        }
      });
      nextCoverPath = target.coverPath;
    }
  }

  const changed =
    nextTitle !== target.title ||
    nextAuthor !== target.author ||
    nextSeries !== target.series ||
    nextDescription !== target.description ||
    nextCoverPath !== target.coverPath;

  if (changed) {
    const previousCoverPath = target.coverPath;
    await db
      .update(books)
      .set({
        title: nextTitle,
        author: nextAuthor,
        series: nextSeries,
        description: nextDescription,
        coverPath: nextCoverPath,
        updatedAt: nowIso()
      })
      .where(eq(books.id, target.id));

    if (previousCoverPath !== nextCoverPath) {
      deleteManagedCoverIfPresent(
        previousCoverPath && previousCoverPath !== nextCoverPath ? previousCoverPath : null
      );
    }
  }

  return { source: metadata.source, updated: changed };
};

const ensureBookExists = async (bookId: number): Promise<boolean> => {
  const found = await db
    .select({ id: books.id })
    .from(books)
    .where(eq(books.id, bookId))
    .limit(1);
  return Boolean(found[0]);
};

export const booksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/books", { preHandler: requireAuth }, async (request) => {
    const { userId } = getAuth(request);
    await ensureSystemCollectionsForUser(userId);

    const query = z
      .object({
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0)
      })
      .parse(request.query);

    const rows = query.q
      ? await db.all(
          sql`
            SELECT ${bookSelectFields(userId)}
            FROM books b
            JOIN book_search bs ON bs.rowid = b.id
            ${bookJoins(userId)}
            WHERE book_search MATCH ${query.q}
            ORDER BY b.updated_at DESC
            LIMIT ${query.limit} OFFSET ${query.offset}
          `
        )
      : await db.all(
          sql`
            SELECT ${bookSelectFields(userId)}
            FROM books b
            ${bookJoins(userId)}
            ORDER BY b.updated_at DESC
            LIMIT ${query.limit} OFFSET ${query.offset}
          `
        );

    return rows.map(mapBookRow);
  });

  fastify.get("/api/v1/books/:id/cover", async (request, reply) => {
    const params = idParams.parse(request.params);
    const query = coverQuerySchema.parse(request.query);

    const bearerToken = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice(7)
      : null;
    const token = bearerToken ?? query.token ?? null;

    if (!token) {
      return reply.code(401).send({ error: "Missing bearer token" });
    }

    try {
      verifyAccessToken(token);
    } catch {
      return reply.code(401).send({ error: "Invalid token" });
    }

    const found = await db
      .select({ coverPath: books.coverPath })
      .from(books)
      .where(eq(books.id, params.id))
      .limit(1);

    const resolved = resolveManagedCoverPath(found[0]?.coverPath);
    if (!resolved || resolved.bookId !== params.id || !fs.existsSync(resolved.absolutePath)) {
      return reply.code(404).send({ error: "Cover not found" });
    }

    reply.header(
      "cache-control",
      query.v ? "public, max-age=31536000, immutable" : "private, no-cache"
    );
    reply.header("content-type", "image/jpeg");
    return reply.send(fs.createReadStream(resolved.absolutePath));
  });

  fastify.get(
    "/api/v1/books/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);
      await ensureSystemCollectionsForUser(userId);

      const params = idParams.parse(request.params);

      const rows = await db.all(
        sql`
          SELECT ${bookSelectFields(userId)}
          FROM books b
          ${bookJoins(userId)}
          WHERE b.id = ${params.id}
          LIMIT 1
        `
      );

      const row = rows[0] as any;
      if (!row) return reply.code(404).send({ error: "Book not found" });

      return mapBookRow(row);
    }
  );

  fastify.patch(
    "/api/v1/books/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);

      const params = idParams.parse(request.params);
      const body = patchBookSchema.parse(request.body);

      const existing = await db
        .select({ id: books.id, coverPath: books.coverPath })
        .from(books)
        .where(eq(books.id, params.id))
        .limit(1);

      if (!existing[0]) return reply.code(404).send({ error: "Book not found" });

      const bookSet: Record<string, unknown> = {};
      if (body.title !== undefined) bookSet.title = body.title;
      if (body.author !== undefined) bookSet.author = body.author;
      if (body.series !== undefined) bookSet.series = body.series;
      if (body.description !== undefined) bookSet.description = body.description;
      if (body.coverPath !== undefined) {
        try {
          bookSet.coverPath = await resolveStoredCoverPathForWrite({
            bookId: params.id,
            coverPath: body.coverPath,
            currentStoredCoverPath: existing[0].coverPath
          });
        } catch (error) {
          return reply.code(400).send({
            error: error instanceof Error ? error.message : "Failed to update cover"
          });
        }
      }

      if (Object.keys(bookSet).length > 0) {
        const nextStoredCoverPath =
          body.coverPath !== undefined
            ? (bookSet.coverPath as string | null | undefined) ?? null
            : existing[0].coverPath;
        bookSet.updatedAt = nowIso();
        await db.update(books).set(bookSet).where(eq(books.id, params.id));

        if (body.coverPath !== undefined && existing[0].coverPath !== nextStoredCoverPath) {
          deleteManagedCoverIfPresent(
            existing[0].coverPath && existing[0].coverPath !== nextStoredCoverPath
              ? existing[0].coverPath
              : null
          );
        }
      }

      if (
        body.status !== undefined ||
        body.progressPercent !== undefined ||
        body.positionRef !== undefined
      ) {
        const current = await db
          .select({
            status: bookProgress.status,
            progressPercent: bookProgress.progressPercent,
            positionRef: bookProgress.positionRef
          })
          .from(bookProgress)
          .where(
            and(
              eq(bookProgress.userId, userId),
              eq(bookProgress.bookId, params.id)
            )
          )
          .limit(1);

        const nextStatus =
          body.status !== undefined
            ? body.status
            : body.progressPercent !== undefined
              ? inferStatusFromProgress(
                  body.progressPercent,
                  await getKoboThresholdsForUser(userId)
                )
              : (current[0]?.status ?? "UNSET");

        await db
          .insert(bookProgress)
          .values({
            userId,
            bookId: params.id,
            status: nextStatus,
            progressPercent: body.progressPercent ?? current[0]?.progressPercent ?? 0,
            positionRef:
              body.positionRef === undefined
                ? (current[0]?.positionRef ?? null)
                : body.positionRef,
            updatedAt: nowIso()
          })
          .onConflictDoUpdate({
            target: [bookProgress.userId, bookProgress.bookId],
            set: {
              status: nextStatus,
              progressPercent: body.progressPercent ?? current[0]?.progressPercent ?? 0,
              positionRef:
                body.positionRef === undefined
                  ? (current[0]?.positionRef ?? null)
                  : body.positionRef,
              updatedAt: nowIso()
            }
          });
      }

      return { ok: true };
    }
  );

  fastify.delete(
    "/api/v1/books/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);

      const params = idParams.parse(request.params);

      const existing = await db
        .select({ id: books.id, filePath: books.filePath, ownerUserId: books.ownerUserId })
        .from(books)
        .where(eq(books.id, params.id))
        .limit(1);

      if (!existing[0]) return reply.code(404).send({ error: "Book not found" });
      if (existing[0].ownerUserId !== userId) {
        return reply.code(403).send({ error: "Forbidden" });
      }

      // Delete related rows first
      await db.delete(collectionBooks).where(eq(collectionBooks.bookId, params.id));
      await db.delete(bookProgress).where(eq(bookProgress.bookId, params.id));
      await db.delete(books).where(eq(books.id, params.id));

      // Delete file from disk (best effort)
      try {
        const fullPath = path.resolve(config.booksDir, existing[0].filePath);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch {
        // ignore file deletion errors
      }

      return { ok: true };
    }
  );

  fastify.get(
    "/api/v1/books/:id/collections",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);
      await ensureSystemCollectionsForUser(userId);

      const params = idParams.parse(request.params);
      if (!(await ensureBookExists(params.id))) {
        return reply.code(404).send({ error: "Book not found" });
      }

      const rows = await db.all(
        sql`
          SELECT c.id, c.name, c.icon, c.slug, c.is_system,
                 CASE WHEN cb.book_id IS NULL THEN 0 ELSE 1 END AS assigned
          FROM collections c
          LEFT JOIN collection_books cb
            ON cb.collection_id = c.id
           AND cb.book_id = ${params.id}
          WHERE c.user_id = ${userId}
          ORDER BY c.is_system DESC, c.name COLLATE NOCASE ASC
        `
      );

      return rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        icon: row.icon,
        slug: row.slug,
        isSystem: row.is_system === 1,
        assigned: row.assigned === 1
      }));
    }
  );

  fastify.put(
    "/api/v1/books/:id/collections",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);
      await ensureSystemCollectionsForUser(userId);

      const params = idParams.parse(request.params);
      const body = updateBookCollectionsSchema.parse(request.body);

      if (!(await ensureBookExists(params.id))) {
        return reply.code(404).send({ error: "Book not found" });
      }

      const nextIds = [...new Set(body.collectionIds)];
      if (nextIds.length > 0) {
        const valid = await db
          .select({ id: collections.id })
          .from(collections)
          .where(and(eq(collections.userId, userId), inArray(collections.id, nextIds)));

        if (valid.length !== nextIds.length) {
          return reply
            .code(400)
            .send({ error: "One or more collectionIds are invalid for this user" });
        }
      }

      const currentRows = await db
        .select({ collectionId: collectionBooks.collectionId })
        .from(collectionBooks)
        .innerJoin(collections, eq(collections.id, collectionBooks.collectionId))
        .where(
          and(
            eq(collections.userId, userId),
            eq(collectionBooks.bookId, params.id)
          )
        );

      const touchedIds = [...new Set([...currentRows.map((row) => row.collectionId), ...nextIds])];

      await db.transaction((tx) => {
        for (const row of currentRows) {
          tx
            .delete(collectionBooks)
            .where(
              and(
                eq(collectionBooks.collectionId, row.collectionId),
                eq(collectionBooks.bookId, params.id)
              )
            )
            .run();
        }

        for (const collectionId of nextIds) {
          const maxSort = tx
            .select({ maxSort: sql<number>`COALESCE(MAX(${collectionBooks.sortOrder}), 0)` })
            .from(collectionBooks)
            .where(eq(collectionBooks.collectionId, collectionId))
            .all();

          tx
            .insert(collectionBooks)
            .values({
              collectionId,
              bookId: params.id,
              sortOrder: (maxSort[0]?.maxSort ?? 0) + 1
            })
            .onConflictDoNothing()
            .run();
        }

        if (touchedIds.length > 0) {
          tx
            .update(collections)
            .set({ updatedAt: nowIso() })
            .where(inArray(collections.id, touchedIds))
            .run();
        }
      });

      return { ok: true };
    }
  );

  fastify.put(
    "/api/v1/books/:id/favorite",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);
      await ensureSystemCollectionsForUser(userId);

      const params = idParams.parse(request.params);
      const body = favoriteSchema.parse(request.body);

      if (!(await ensureBookExists(params.id))) {
        return reply.code(404).send({ error: "Book not found" });
      }

      const favoritesCollectionId = await getFavoritesCollectionId(userId);

      if (body.favorite) {
        const maxSort = await db
          .select({ maxSort: sql<number>`COALESCE(MAX(${collectionBooks.sortOrder}), 0)` })
          .from(collectionBooks)
          .where(eq(collectionBooks.collectionId, favoritesCollectionId));

        await db
          .insert(collectionBooks)
          .values({
            collectionId: favoritesCollectionId,
            bookId: params.id,
            sortOrder: (maxSort[0]?.maxSort ?? 0) + 1
          })
          .onConflictDoNothing();
      } else {
        await db
          .delete(collectionBooks)
          .where(
            and(
              eq(collectionBooks.collectionId, favoritesCollectionId),
              eq(collectionBooks.bookId, params.id)
            )
          );
      }

      await db
        .update(collections)
        .set({ updatedAt: nowIso() })
        .where(eq(collections.id, favoritesCollectionId));

      return { ok: true };
    }
  );

  fastify.post(
    "/api/v1/books/metadata/fetch-all",
    { preHandler: requireAuth },
    async (request) => {
      const { userId } = getAuth(request);
      const allBooks = await db
        .select({
          id: books.id,
          title: books.title,
          author: books.author,
          series: books.series,
          description: books.description,
          coverPath: books.coverPath,
          filePath: books.filePath
        })
        .from(books);

      let refreshed = 0;
      let updated = 0;
      let matched = 0;
      let fallback = 0;
      let failed = 0;

      for (const book of allBooks) {
        try {
          const result = await refreshBookMetadata(book);
          refreshed += 1;
          if (result.updated) updated += 1;
          if (result.source === "NONE") {
            fallback += 1;
          } else {
            matched += 1;
          }
        } catch (error) {
          await logAdminActivity({
            scope: "metadata",
            event: "metadata.bulk_refresh_failed",
            message: "Bulk metadata refresh failed for a book",
            actorUserId: userId,
            bookId: book.id,
            details: {
              title: book.title,
              author: book.author,
              filePath: book.filePath,
              error
            }
          });
          failed += 1;
        }
      }

      return {
        ok: true,
        total: allBooks.length,
        refreshed,
        updated,
        matched,
        fallback,
        failed
      };
    }
  );

  fastify.post(
    "/api/v1/books/:id/metadata/fetch",
    { preHandler: requireAuth },
    async (request, reply) => {
      getAuth(request);
      const params = idParams.parse(request.params);

      const found = await db
        .select({
          id: books.id,
          title: books.title,
          author: books.author,
          series: books.series,
          description: books.description,
          coverPath: books.coverPath,
          filePath: books.filePath
        })
        .from(books)
        .where(eq(books.id, params.id))
        .limit(1);

      if (!found[0]) return reply.code(404).send({ error: "Book not found" });

      try {
        const result = await refreshBookMetadata(found[0]);
        return { ok: true, source: result.source, updated: result.updated };
      } catch (error) {
        await logAdminActivity({
          scope: "metadata",
          event: "metadata.manual_refresh_failed",
          message: "Manual metadata refresh failed",
          actorUserId: request.auth?.userId ?? null,
          bookId: found[0].id,
          details: {
            title: found[0].title,
            author: found[0].author,
            filePath: found[0].filePath,
            error
          }
        });
        return reply.code(500).send({ error: "Metadata refresh failed" });
      }
    }
  );

  fastify.get(
    "/api/v1/books/:id/download",
    { preHandler: requireAuth },
    async (request, reply) => {
      const params = idParams.parse(request.params);
      const rows = await db
        .select({ filePath: books.filePath, title: books.title, fileExt: books.fileExt })
        .from(books)
        .where(eq(books.id, params.id))
        .limit(1);
      const row = rows[0];
      if (!row) return reply.code(404).send({ error: "Book not found" });

      const absolutePath = path.join(config.booksDir, row.filePath);
      if (!fs.existsSync(absolutePath)) {
        return reply.code(404).send({ error: "File not found" });
      }

      const stats = fs.statSync(absolutePath);
      applyDownloadHeaders(reply, `${row.title}.${row.fileExt}`, stats.size);
      return reply.send(fs.createReadStream(absolutePath));
    }
  );
};
