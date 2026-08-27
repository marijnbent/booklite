import fs from "node:fs";
import { FastifyPluginAsync } from "fastify";
import { config } from "../config";
import { sqlite } from "../db/client";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/healthcheck", async (_request, reply) => {
    try {
      sqlite.prepare("SELECT 1").get();
      fs.accessSync(config.appDataDir, fs.constants.R_OK | fs.constants.W_OK);
      fs.accessSync(config.booksDir, fs.constants.R_OK | fs.constants.W_OK);
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });
};
