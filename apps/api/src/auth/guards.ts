import { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "./jwt";

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
    request.auth = {
      userId: payload.userId,
      role: payload.role,
      username: payload.username
    };
  } catch {
    void reply.code(401).send({ error: "Invalid token" });
  }
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
