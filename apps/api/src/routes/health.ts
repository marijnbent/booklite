import { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/healthcheck", async () => ({ ok: true }));
};
