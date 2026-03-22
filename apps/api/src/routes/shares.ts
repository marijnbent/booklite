import { FastifyPluginAsync } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { bookShares, books, users } from "../db/schema";
import { getAuth, requireAuth } from "../auth/guards";
import { idParams } from "../schemas";
import { nowIso } from "../utils/time";

const createShareSchema = z.object({
  recipientUserId: z.coerce.number().int().positive()
});

const shareIdParams = z.object({
  id: z.coerce.number().int().positive(),
  shareId: z.coerce.number().int().positive()
});

const findOwnedBook = async (bookId: number, userId: number) => {
  const rows = await db
    .select({
      id: books.id,
      ownerUserId: books.ownerUserId
    })
    .from(books)
    .where(eq(books.id, bookId))
    .limit(1);

  const book = rows[0];
  if (!book) return { status: "missing" as const };
  if (book.ownerUserId !== userId) return { status: "forbidden" as const };
  return { status: "ok" as const };
};

export const sharesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/v1/books/:id/shares",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);
      const params = idParams.parse(request.params);
      const body = createShareSchema.parse(request.body);

      const ownedBook = await findOwnedBook(params.id, userId);
      if (ownedBook.status === "missing") {
        return reply.code(404).send({ error: "Book not found" });
      }
      if (ownedBook.status === "forbidden") {
        return reply.code(403).send({ error: "Only the owner can share this book" });
      }
      if (body.recipientUserId === userId) {
        return reply.code(400).send({ error: "You cannot share a book with yourself" });
      }

      const recipient = await db
        .select({
          id: users.id
        })
        .from(users)
        .where(and(eq(users.id, body.recipientUserId), isNull(users.disabledAt)))
        .limit(1);

      if (!recipient[0]) {
        return reply.code(400).send({ error: "Recipient is not available" });
      }

      const sharedAt = nowIso();
      await db
        .insert(bookShares)
        .values({
          bookId: params.id,
          ownerUserId: userId,
          recipientUserId: body.recipientUserId,
          sharedAt,
          removedAt: null
        })
        .onConflictDoUpdate({
          target: [bookShares.bookId, bookShares.recipientUserId],
          set: {
            ownerUserId: userId,
            sharedAt,
            removedAt: null
          }
        });

      const rows = await db
        .select({
          id: bookShares.id,
          recipientUserId: bookShares.recipientUserId,
          username: users.username,
          sharedAt: bookShares.sharedAt
        })
        .from(bookShares)
        .innerJoin(users, eq(users.id, bookShares.recipientUserId))
        .where(
          and(
            eq(bookShares.bookId, params.id),
            eq(bookShares.recipientUserId, body.recipientUserId),
            isNull(bookShares.removedAt)
          )
        )
        .limit(1);

      return reply.code(201).send(rows[0]);
    }
  );

  fastify.get(
    "/api/v1/books/:id/shares",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);
      const params = idParams.parse(request.params);

      const ownedBook = await findOwnedBook(params.id, userId);
      if (ownedBook.status === "missing") {
        return reply.code(404).send({ error: "Book not found" });
      }
      if (ownedBook.status === "forbidden") {
        return reply.code(403).send({ error: "Only the owner can view shares for this book" });
      }

      return db
        .select({
          id: bookShares.id,
          recipientUserId: bookShares.recipientUserId,
          username: users.username,
          sharedAt: bookShares.sharedAt
        })
        .from(bookShares)
        .innerJoin(users, eq(users.id, bookShares.recipientUserId))
        .where(
          and(
            eq(bookShares.bookId, params.id),
            eq(bookShares.ownerUserId, userId),
            isNull(bookShares.removedAt)
          )
        )
        .orderBy(users.username);
    }
  );

  fastify.delete(
    "/api/v1/books/:id/shares/:shareId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);
      const params = shareIdParams.parse(request.params);

      const ownedBook = await findOwnedBook(params.id, userId);
      if (ownedBook.status === "missing") {
        return reply.code(404).send({ error: "Book not found" });
      }
      if (ownedBook.status === "forbidden") {
        return reply.code(403).send({ error: "Only the owner can revoke shares for this book" });
      }

      const deleted = await db
        .delete(bookShares)
        .where(
          and(
            eq(bookShares.id, params.shareId),
            eq(bookShares.bookId, params.id),
            eq(bookShares.ownerUserId, userId)
          )
        )
        .returning({ id: bookShares.id });

      if (!deleted[0]) {
        return reply.code(404).send({ error: "Share not found" });
      }

      return reply.code(204).send();
    }
  );

  fastify.delete(
    "/api/v1/books/:id/share",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);
      const params = idParams.parse(request.params);

      const updated = await db
        .update(bookShares)
        .set({ removedAt: nowIso() })
        .where(
          and(
            eq(bookShares.bookId, params.id),
            eq(bookShares.recipientUserId, userId),
            isNull(bookShares.removedAt)
          )
        )
        .returning({ id: bookShares.id });

      if (!updated[0]) {
        return reply.code(404).send({ error: "Share not found" });
      }

      return reply.code(204).send();
    }
  );
};
