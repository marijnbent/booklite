import { FastifyPluginAsync } from "fastify";
import { and, count, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { books, users } from "../db/schema";
import { getAuth, requireAuth, requireOwner } from "../auth/guards";
import { hashPassword } from "../auth/password";
import { issueTokens } from "../auth/tokens";
import { nowIso } from "../utils/time";
import { ensureKoboSettingsRow } from "../services/koboSettings";
import { ensureSystemCollectionsForUser } from "../services/systemCollections";
import { logAdminActivity } from "../services/adminActivityLog";
import { idParams } from "../schemas";

const nullableEmailSchema = z.preprocess((value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.toLowerCase();
}, z.union([z.string().email(), z.null()]));

const updatableEmailSchema = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.toLowerCase();
}, z.union([z.string().email(), z.null()]).optional());

const createUserSchema = z.object({
  email: nullableEmailSchema.optional().default(null),
  username: z.string().trim().min(3),
  password: z.string().min(6),
  role: z.enum(["OWNER", "MEMBER"]).default("MEMBER")
});

const patchUserSchema = z.object({
  email: updatableEmailSchema,
  username: z.string().trim().min(3).optional(),
  role: z.enum(["OWNER", "MEMBER"]).optional(),
  disabled: z.boolean().optional()
});

export const usersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/users", { preHandler: requireOwner }, async () =>
    db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        role: users.role,
        createdAt: users.createdAt,
        disabledAt: users.disabledAt
      })
      .from(users)
      .orderBy(users.id)
  );

  fastify.get("/api/v1/users/peers", { preHandler: requireAuth }, async (request) => {
    const { userId } = getAuth(request);

    return db
      .select({
        id: users.id,
        username: users.username
      })
      .from(users)
      .where(and(ne(users.id, userId), isNull(users.disabledAt)))
      .orderBy(users.username);
  });

  fastify.post("/api/v1/users", { preHandler: requireOwner }, async (request, reply) => {
    const body = createUserSchema.parse(request.body);

    const [created] = await db
      .insert(users)
      .values({
        email: body.email,
        username: body.username,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        createdAt: nowIso(),
        disabledAt: null
      })
      .returning({
        id: users.id,
        email: users.email,
        username: users.username,
        role: users.role,
        createdAt: users.createdAt,
        disabledAt: users.disabledAt
      });

    await ensureKoboSettingsRow(created.id);

    await ensureSystemCollectionsForUser(created.id, {
      preselectFavoritesForKobo: true
    });

    return reply.code(201).send(created);
  });

  fastify.patch(
    "/api/v1/users/:id",
    { preHandler: requireOwner },
    async (request, reply) => {
      const params = idParams.parse(request.params);
      const body = patchUserSchema.parse(request.body);

      const set: Record<string, unknown> = {};
      if (body.email !== undefined) set.email = body.email;
      if (body.username !== undefined) set.username = body.username;
      if (body.role) set.role = body.role;
      if (body.disabled !== undefined) {
        set.disabledAt = body.disabled ? nowIso() : null;
      }

      if (Object.keys(set).length === 0) {
        const [existing] = await db
          .select({
            id: users.id,
            email: users.email,
            username: users.username,
            role: users.role,
            createdAt: users.createdAt,
            disabledAt: users.disabledAt
          })
          .from(users)
          .where(eq(users.id, params.id))
          .limit(1);

        if (!existing) return reply.code(404).send({ error: "User not found" });
        return existing;
      }

      const [updated] = await db
        .update(users)
        .set(set)
        .where(eq(users.id, params.id))
        .returning({
          id: users.id,
          email: users.email,
          username: users.username,
          role: users.role,
          createdAt: users.createdAt,
          disabledAt: users.disabledAt
        });

      if (!updated) return reply.code(404).send({ error: "User not found" });
      return updated;
    }
  );

  fastify.delete(
    "/api/v1/users/:id",
    { preHandler: requireOwner },
    async (request, reply) => {
      const params = idParams.parse(request.params);
      const actor = getAuth(request);

      const found = await db
        .select({
          id: users.id,
          username: users.username,
          disabledAt: users.disabledAt
        })
        .from(users)
        .where(eq(users.id, params.id))
        .limit(1);

      const target = found[0];
      if (!target) return reply.code(404).send({ error: "User not found" });
      if (!target.disabledAt) {
        return reply.code(409).send({ error: "Only disabled users can be deleted" });
      }
      if (target.id === actor.userId) {
        return reply.code(400).send({ error: "You cannot delete your own account" });
      }

      const [{ ownedBooks }] = await db
        .select({ ownedBooks: count() })
        .from(books)
        .where(eq(books.ownerUserId, target.id));

      if (ownedBooks > 0) {
        return reply.code(409).send({ error: "Disabled users with books cannot be deleted" });
      }

      await db.delete(users).where(eq(users.id, target.id));
      return { ok: true };
    }
  );

  fastify.post(
    "/api/v1/admin/users/:id/impersonate",
    { preHandler: requireOwner },
    async (request, reply) => {
      const params = idParams.parse(request.params);
      const actor = getAuth(request);

      const found = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          role: users.role,
          disabledAt: users.disabledAt
        })
        .from(users)
        .where(eq(users.id, params.id))
        .limit(1);

      const target = found[0];
      if (!target) return reply.code(404).send({ error: "User not found" });
      if (target.disabledAt) {
        return reply.code(409).send({ error: "Disabled users cannot be impersonated" });
      }
      if (target.role !== "MEMBER") {
        return reply.code(403).send({ error: "Only member accounts can be impersonated" });
      }
      if (target.id === actor.userId) {
        return reply.code(400).send({ error: "Use your existing session instead" });
      }

      const tokens = await issueTokens({
        userId: target.id,
        username: target.username,
        role: target.role
      });

      await logAdminActivity({
        scope: "auth",
        event: "admin_impersonation_started",
        level: "INFO",
        message: `Admin ${actor.username} started impersonating ${target.username}`,
        actorUserId: actor.userId,
        targetUserId: target.id,
        details: {
          actorUsername: actor.username,
          targetUsername: target.username,
          targetRole: target.role
        }
      });

      return {
        tokens,
        impersonatedUser: {
          id: target.id,
          email: target.email,
          username: target.username,
          role: target.role
        }
      };
    }
  );
};
