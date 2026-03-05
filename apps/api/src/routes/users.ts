import { FastifyPluginAsync } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { koboUserSettings, users } from "../db/schema";
import { requireOwner } from "../auth/guards";
import { hashPassword } from "../auth/password";
import { nowIso } from "../utils/time";
import { randomToken } from "../utils/hash";
import { ensureSystemCollectionsForUser } from "../services/systemCollections";

const createUserSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  username: z.string().trim().min(3),
  password: z.string().min(6),
  role: z.enum(["OWNER", "MEMBER"]).default("MEMBER")
});

const patchUserSchema = z.object({
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

    await db.insert(koboUserSettings).values({
      userId: created.id,
      token: randomToken(),
      syncEnabled: 0,
      twoWayProgressSync: 0,
      markReadingThreshold: 1,
      markFinishedThreshold: 99,
      updatedAt: nowIso()
    });

    await ensureSystemCollectionsForUser(created.id, {
      preselectFavoritesForKobo: true
    });

    return reply.code(201).send(created);
  });

  fastify.patch(
    "/api/v1/users/:id",
    { preHandler: requireOwner },
    async (request, reply) => {
      const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
      const body = patchUserSchema.parse(request.body);

      const set: Record<string, unknown> = {};
      if (body.role) set.role = body.role;
      if (body.disabled !== undefined) {
        set.disabledAt = body.disabled ? nowIso() : null;
      }

      if (Object.keys(set).length === 0) {
        return reply.code(400).send({ error: "No fields to update" });
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
};
