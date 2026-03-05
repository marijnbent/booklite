import path from "node:path";
import { FastifyPluginAsync } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { bookProgress, books } from "../db/schema";
import { requireAuth } from "../auth/guards";
import { nowIso } from "../utils/time";
import { fetchMetadataWithFallback } from "../services/metadata";

const patchBookSchema = z.object({
  title: z.string().min(1).optional(),
  author: z.string().nullable().optional(),
  series: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["UNREAD", "READING", "DONE"]).optional(),
  progressPercent: z.coerce.number().min(0).max(100).optional(),
  positionRef: z.string().nullable().optional()
});

export const booksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/books", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });

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
            SELECT b.*, bp.status AS progress_status, bp.progress_percent, bp.position_ref, bp.updated_at AS progress_updated_at
            FROM books b
            JOIN book_search bs ON bs.rowid = b.id
            LEFT JOIN book_progress bp ON bp.book_id = b.id AND bp.user_id = ${request.auth.userId}
            WHERE book_search MATCH ${query.q}
            ORDER BY b.updated_at DESC
            LIMIT ${query.limit} OFFSET ${query.offset}
          `
        )
      : await db.all(
          sql`
            SELECT b.*, bp.status AS progress_status, bp.progress_percent, bp.position_ref, bp.updated_at AS progress_updated_at
            FROM books b
            LEFT JOIN book_progress bp ON bp.book_id = b.id AND bp.user_id = ${request.auth.userId}
            ORDER BY b.updated_at DESC
            LIMIT ${query.limit} OFFSET ${query.offset}
          `
        );

    return rows.map((row: any) => ({
      id: row.id,
      ownerUserId: row.owner_user_id,
      title: row.title,
      author: row.author,
      series: row.series,
      description: row.description,
      coverPath: row.cover_path,
      filePath: row.file_path,
      fileExt: row.file_ext,
      fileSize: row.file_size,
      koboSyncable: row.kobo_syncable,
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
    }));
  });

  fastify.get(
    "/api/v1/books/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });

      const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);

      const rows = await db.all(
        sql`
          SELECT b.*, bp.status AS progress_status, bp.progress_percent, bp.position_ref, bp.updated_at AS progress_updated_at
          FROM books b
          LEFT JOIN book_progress bp ON bp.book_id = b.id AND bp.user_id = ${request.auth.userId}
          WHERE b.id = ${params.id}
          LIMIT 1
        `
      );

      const row = rows[0] as any;
      if (!row) return reply.code(404).send({ error: "Book not found" });

      return {
        id: row.id,
        ownerUserId: row.owner_user_id,
        title: row.title,
        author: row.author,
        series: row.series,
        description: row.description,
        coverPath: row.cover_path,
        filePath: row.file_path,
        fileExt: row.file_ext,
        fileSize: row.file_size,
        koboSyncable: row.kobo_syncable,
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
      };
    }
  );

  fastify.patch(
    "/api/v1/books/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });

      const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
      const body = patchBookSchema.parse(request.body);

      const existing = await db
        .select({ id: books.id })
        .from(books)
        .where(eq(books.id, params.id))
        .limit(1);

      if (!existing[0]) return reply.code(404).send({ error: "Book not found" });

      const bookSet: Record<string, unknown> = {};
      if (body.title !== undefined) bookSet.title = body.title;
      if (body.author !== undefined) bookSet.author = body.author;
      if (body.series !== undefined) bookSet.series = body.series;
      if (body.description !== undefined) bookSet.description = body.description;

      if (Object.keys(bookSet).length > 0) {
        bookSet.updatedAt = nowIso();
        await db.update(books).set(bookSet).where(eq(books.id, params.id));
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
              eq(bookProgress.userId, request.auth.userId),
              eq(bookProgress.bookId, params.id)
            )
          )
          .limit(1);

        await db
          .insert(bookProgress)
          .values({
            userId: request.auth.userId,
            bookId: params.id,
            status: body.status ?? current[0]?.status ?? "UNREAD",
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
              status: body.status ?? current[0]?.status ?? "UNREAD",
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

  fastify.post(
    "/api/v1/books/:id/metadata/fetch",
    { preHandler: requireAuth },
    async (request, reply) => {
      const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);

      const found = await db
        .select({ id: books.id, title: books.title, author: books.author })
        .from(books)
        .where(eq(books.id, params.id))
        .limit(1);

      if (!found[0]) return reply.code(404).send({ error: "Book not found" });

      const metadata = await fetchMetadataWithFallback(
        found[0].title,
        found[0].author ?? undefined
      );

      if (metadata.source === "NONE") {
        return { ok: true, source: "NONE" };
      }

      await db
        .update(books)
        .set({
          title: metadata.title ?? found[0].title,
          author: metadata.author ?? found[0].author,
          description: metadata.description ?? null,
          coverPath: metadata.coverPath ?? null,
          updatedAt: nowIso()
        })
        .where(eq(books.id, params.id));

      return { ok: true, source: metadata.source };
    }
  );

  fastify.get(
    "/api/v1/books/:id/download",
    { preHandler: requireAuth },
    async (request, reply) => {
      const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
      const rows = await db
        .select({ filePath: books.filePath, title: books.title, fileExt: books.fileExt })
        .from(books)
        .where(eq(books.id, params.id))
        .limit(1);
      const row = rows[0];
      if (!row) return reply.code(404).send({ error: "Book not found" });

      const absolutePath = path.join(process.env.BOOKS_DIR ?? "/books", row.filePath);
      if (!require("node:fs").existsSync(absolutePath)) {
        return reply.code(404).send({ error: "File not found" });
      }

      return reply
        .header("content-disposition", `attachment; filename=\"${row.title}.${row.fileExt}\"`)
        .send(require("node:fs").createReadStream(absolutePath));
    }
  );
};
