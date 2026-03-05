import { FastifyPluginAsync } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { importJobs } from "../db/schema";
import { requireAuth } from "../auth/guards";

export const importJobRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/api/v1/import-jobs/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });

      const params = z.object({ id: z.string().min(1) }).parse(request.params);

      const rows = await db
        .select({
          id: importJobs.id,
          userId: importJobs.userId,
          status: importJobs.status,
          type: importJobs.type,
          payloadJson: importJobs.payloadJson,
          resultJson: importJobs.resultJson,
          error: importJobs.error,
          createdAt: importJobs.createdAt,
          updatedAt: importJobs.updatedAt
        })
        .from(importJobs)
        .where(and(eq(importJobs.id, params.id), eq(importJobs.userId, request.auth.userId)))
        .limit(1);

      if (!rows[0]) return reply.code(404).send({ error: "Job not found" });

      return {
        ...rows[0],
        payload: JSON.parse(rows[0].payloadJson),
        result: rows[0].resultJson ? JSON.parse(rows[0].resultJson) : null
      };
    }
  );
};
