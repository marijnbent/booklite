import { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { verifyAccessToken } from "./jwt";
import { db } from "../db/client";
import { apiTokens, users } from "../db/schema";

declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      userId: number;
      role: "OWNER" | "MEMBER";
      username: string;
    };
  }
}

export const requireAuth = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    void reply.code(401).send({ error: "Missing bearer token" });
    return;
  }

  try {
    const payload = verifyAccessToken(authHeader.slice(7));
    if (payload.jti) {
      const row = await db
        .select({ revokedAt: apiTokens.revokedAt, userId: apiTokens.userId })
        .from(apiTokens)
        .where(eq(apiTokens.jti, payload.jti))
        .limit(1);
      if (!row[0] || row[0].revokedAt || row[0].userId !== payload.userId) {
        void reply.code(401).send({ error: "Token revoked" });
        return;
      }
    }

    const [currentUser] = await db
      .select({
        id: users.id,
        role: users.role,
        username: users.username
      })
      .from(users)
      .where(and(eq(users.id, payload.userId), isNull(users.disabledAt)))
      .limit(1);

    if (!currentUser) {
      void reply.code(401).send({ error: "User is disabled or missing" });
      return;
    }

    request.auth = {
      userId: currentUser.id,
      role: currentUser.role,
      username: currentUser.username
    };
  } catch {
    void reply.code(401).send({ error: "Invalid token" });
  }
};

export const getAuth = (
  request: FastifyRequest
): NonNullable<FastifyRequest["auth"]> => {
  const auth = request.auth;
  if (!auth) {
    throw new Error("requireAuth middleware not applied");
  }
  return auth;
};

export const requireOwner = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  await requireAuth(request, reply);
  if (reply.sent) return;

  if (request.auth?.role !== "OWNER") {
    void reply.code(403).send({ error: "Owner role required" });
  }
};
