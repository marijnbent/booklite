import { FastifyPluginAsync } from "fastify";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { refreshTokens, users } from "../db/schema";
import { verifyPassword } from "../auth/password";
import { randomToken, sha256 } from "../utils/hash";
import { nowIso } from "../utils/time";
import { config } from "../config";
import { requireAuth } from "../auth/guards";
import { signAccessToken } from "../auth/jwt";

const loginSchema = z.object({
  usernameOrEmail: z.string().trim().min(1),
  password: z.string().min(1)
});

const refreshSchema = z.object({ refreshToken: z.string().min(8) });

const issueTokens = async (input: {
  userId: number;
  username: string;
  role: "OWNER" | "MEMBER";
}) => {
  const accessToken = signAccessToken({
    userId: input.userId,
    role: input.role,
    username: input.username
  });
  const refreshToken = randomToken();
  const timestamp = nowIso();
  const expiresAt = new Date(
    Date.now() + config.refreshTokenTtlSeconds * 1000
  ).toISOString();

  await db.insert(refreshTokens).values({
    userId: input.userId,
    tokenHash: sha256(refreshToken),
    createdAt: timestamp,
    expiresAt,
    revokedAt: null
  });

  return {
    accessToken,
    refreshToken,
    expiresInSeconds: config.accessTokenTtlSeconds
  };
};

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/v1/auth/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const identifier = body.usernameOrEmail;

      const account = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          passwordHash: users.passwordHash,
          role: users.role,
          disabledAt: users.disabledAt
        })
        .from(users)
        .where(
          or(
            sql`trim(${users.username}) = trim(${identifier})`,
            sql`lower(trim(${users.email})) = lower(trim(${identifier}))`
          )
        )
        .limit(1);

      const user = account[0];
      if (!user || user.disabledAt) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      const validPassword = await verifyPassword(user.passwordHash, body.password);
      if (!validPassword) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      return issueTokens({
        userId: user.id,
        username: user.username,
        role: user.role
      });
    }
  );

  fastify.post(
    "/api/v1/auth/refresh",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const body = refreshSchema.parse(request.body);
      const tokenHash = sha256(body.refreshToken);

      const found = await db
        .select({
          userId: refreshTokens.userId,
          expiresAt: refreshTokens.expiresAt,
          revokedAt: refreshTokens.revokedAt,
          username: users.username,
          role: users.role,
          disabledAt: users.disabledAt
        })
        .from(refreshTokens)
        .innerJoin(users, eq(users.id, refreshTokens.userId))
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);

      const row = found[0];
      if (!row || row.revokedAt || row.disabledAt || new Date(row.expiresAt).getTime() < Date.now()) {
        return reply.code(401).send({ error: "Invalid refresh token" });
      }

      await db
        .update(refreshTokens)
        .set({ revokedAt: nowIso() })
        .where(eq(refreshTokens.tokenHash, tokenHash));

      return issueTokens({
        userId: row.userId,
        username: row.username,
        role: row.role
      });
    }
  );

  fastify.post("/api/v1/auth/logout", async (request) => {
    const body = refreshSchema.parse(request.body);
    await db
      .update(refreshTokens)
      .set({ revokedAt: nowIso() })
      .where(eq(refreshTokens.tokenHash, sha256(body.refreshToken)));

    return { ok: true };
  });

  fastify.get("/api/v1/me", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });

    const found = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        role: users.role,
        createdAt: users.createdAt,
        disabledAt: users.disabledAt
      })
      .from(users)
      .where(and(eq(users.id, request.auth.userId), isNull(users.disabledAt)))
      .limit(1);

    if (!found[0]) return reply.code(401).send({ error: "Unauthorized" });
    return found[0];
  });
};
