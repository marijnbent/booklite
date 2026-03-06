import { FastifyPluginAsync } from "fastify";
import { count } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword } from "../auth/password";
import { nowIso } from "../utils/time";
import { ensureKoboSettingsRow } from "../services/koboSettings";
import { ensureSystemCollectionsForUser } from "../services/systemCollections";

const setupSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  username: z.string().trim().min(3),
  password: z.string().min(6)
});

export const setupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/setup/status", async () => {
    const [{ total }] = await db.select({ total: count() }).from(users);
    return {
      completed: total > 0
    };
  });

  fastify.post("/api/v1/setup", async (request, reply) => {
    const body = setupSchema.parse(request.body);
    const [{ total }] = await db.select({ total: count() }).from(users);
    if (total > 0) {
      return reply.code(403).send({ error: "Setup is already completed" });
    }

    const timestamp = nowIso();
    const passwordHash = await hashPassword(body.password);
    const [owner] = await db
      .insert(users)
      .values({
        email: body.email,
        username: body.username,
        passwordHash,
        role: "OWNER",
        createdAt: timestamp,
        disabledAt: null
      })
      .returning({ id: users.id, email: users.email, username: users.username, role: users.role });

    await ensureKoboSettingsRow(owner.id);

    await ensureSystemCollectionsForUser(owner.id, {
      preselectFavoritesForKobo: true
    });

    return reply.code(201).send(owner);
  });
};
