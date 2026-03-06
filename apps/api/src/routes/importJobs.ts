import { FastifyPluginAsync } from "fastify";
import { and, eq } from "drizzle-orm";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { importJobs } from "../db/schema";
import { getAuth, requireAuth } from "../auth/guards";

const serializeImportJob = (row: {
  id: string;
  status: string;
  type: string;
  payloadJson: string;
  resultJson: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}) => ({
  id: row.id,
  status: row.status,
  type: row.type,
  payload: JSON.parse(row.payloadJson),
  result: row.resultJson ? JSON.parse(row.resultJson) : null,
  error: row.error,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export const importJobRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/v1/import-jobs/query",
    { preHandler: requireAuth },
    async (request) => {
      const { userId } = getAuth(request);

      const body = z
        .object({
          ids: z.array(z.string().min(1)).min(1).max(100)
        })
        .parse(request.body);

      const uniqueIds = [...new Set(body.ids)];
      const rows = await db
        .select({
          id: importJobs.id,
          status: importJobs.status,
          type: importJobs.type,
          payloadJson: importJobs.payloadJson,
          resultJson: importJobs.resultJson,
          error: importJobs.error,
          createdAt: importJobs.createdAt,
          updatedAt: importJobs.updatedAt
        })
        .from(importJobs)
        .where(and(eq(importJobs.userId, userId), inArray(importJobs.id, uniqueIds)));

      const byId = new Map(rows.map((row) => [row.id, row]));

      return {
        jobs: uniqueIds.flatMap((id) => {
          const row = byId.get(id);
          if (!row) return [];

          return [serializeImportJob(row)];
        })
      };
    }
  );

  fastify.get(
    "/api/v1/import-jobs/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);

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
        .where(and(eq(importJobs.id, params.id), eq(importJobs.userId, userId)))
        .limit(1);

      if (!rows[0]) return reply.code(404).send({ error: "Job not found" });

      return serializeImportJob(rows[0]);
    }
  );
};
