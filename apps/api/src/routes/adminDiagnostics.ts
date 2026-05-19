import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireOwner } from "../auth/guards";
import { getAdminDiagnostics } from "../services/adminDiagnostics";
import type {
  AdminActivityLevel,
  AdminActivityScope
} from "../services/adminActivityLog";

const querySchema = z.object({
  scope: z.enum(["metadata", "upload", "kobo", "auth"]).optional(),
  level: z.enum(["ERROR", "WARN", "INFO"]).optional(),
  limit: z.coerce.number().int().min(1).max(250).default(100)
});

export const adminDiagnosticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/admin/diagnostics", { preHandler: requireOwner }, async (request) => {
    const query = querySchema.parse(request.query);
    return getAdminDiagnostics({
      scope: query.scope as AdminActivityScope | undefined,
      level: query.level as AdminActivityLevel | undefined,
      limit: query.limit
    });
  });
};
