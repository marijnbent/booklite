import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/guards";
import { config } from "../config";
import { isSupportedBookExt } from "../services/books";
import { randomToken } from "../utils/hash";
import { queueUploadJob, getUploadLimitBytes } from "../services/jobs";

const sanitizeFileName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);

const dedupePath = (targetPath: string): string => {
  if (!fs.existsSync(targetPath)) return targetPath;

  const ext = path.extname(targetPath);
  const base = targetPath.slice(0, -ext.length);
  let attempt = 1;
  while (fs.existsSync(`${base}-${attempt}${ext}`)) {
    attempt += 1;
  }
  return `${base}-${attempt}${ext}`;
};

export const uploadRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/v1/uploads",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: "No file provided" });
      }

      const originalName = sanitizeFileName(file.filename);
      const fileExt = path.extname(originalName).slice(1).toLowerCase();

      if (!isSupportedBookExt(fileExt)) {
        return reply.code(400).send({ error: "Only EPUB and PDF are supported" });
      }

      const maxBytes = await getUploadLimitBytes();
      if (file.file.bytesRead > maxBytes) {
        return reply.code(413).send({ error: `File exceeds ${maxBytes} bytes limit` });
      }

      const datePrefix = new Date().toISOString().slice(0, 10);
      const targetDir = path.join(config.booksDir, datePrefix);
      fs.mkdirSync(targetDir, { recursive: true });

      const fileBaseName = `${Date.now()}-${originalName}`;
      const targetPath = dedupePath(path.join(targetDir, fileBaseName));
      const writeStream = fs.createWriteStream(targetPath);

      await pipeline(file.file, writeStream);
      const stat = fs.statSync(targetPath);

      if (stat.size > maxBytes) {
        fs.rmSync(targetPath, { force: true });
        return reply.code(413).send({ error: `File exceeds ${maxBytes} bytes limit` });
      }

      const jobId = randomToken();
      const relativeFilePath = path.relative(config.booksDir, targetPath);

      await queueUploadJob({
        id: jobId,
        userId: request.auth.userId,
        fileName: originalName,
        filePath: relativeFilePath,
        fileSize: stat.size,
        fileExt
      });

      return reply.code(202).send({
        jobId,
        status: "QUEUED"
      });
    }
  );
};
