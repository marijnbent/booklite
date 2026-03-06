import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireOwner } from "../auth/guards";
import {
  clearAdminActivity,
  listAdminActivity,
  type AdminActivityScope
} from "../services/adminActivityLog";

const querySchema = z.object({
  scope: z.enum(["metadata", "upload", "kobo"]).optional(),
  limit: z.coerce.number().int().min(1).max(250).default(100)
});

const clearSchema = z
  .object({
    scope: z.enum(["metadata", "upload", "kobo"]).optional()
  })
  .optional();

export const adminActivityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/admin/activity-log", { preHandler: requireOwner }, async (request) => {
    const query = querySchema.parse(request.query);
    return listAdminActivity({
      scope: query.scope as AdminActivityScope | undefined,
      limit: query.limit
    });
  });

  fastify.delete(
    "/api/v1/admin/activity-log",
    { preHandler: requireOwner },
    async (request) => {
      const body = clearSchema.parse(request.body);
      const cleared = await clearAdminActivity({
        scope: body?.scope as AdminActivityScope | undefined
      });
      return { ok: true, cleared };
    }
  );
};
