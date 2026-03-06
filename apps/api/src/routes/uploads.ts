import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { FastifyPluginAsync } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../auth/guards";
import { config } from "../config";
import { isSupportedBookExt } from "../services/books";
import { randomToken } from "../utils/hash";
import { queueUploadJob, getUploadLimitBytes } from "../services/jobs";
import { db } from "../db/client";
import { collections } from "../db/schema";

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

const normalizeOptionalText = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseBooleanField = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const removeUploadedFileIfExists = (filePath: string | undefined): void => {
  if (!filePath) return;
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // best-effort cleanup only
  }
};

export const uploadRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/v1/uploads",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!request.auth) return reply.code(401).send({ error: "Unauthorized" });

      const fields: Record<string, string> = {};
      let uploadedFile:
        | {
            originalName: string;
            fileExt: string;
            targetPath: string;
          }
        | undefined;

      const maxBytes = await getUploadLimitBytes();

      for await (const part of request.parts()) {
        if (part.type === "field") {
          fields[part.fieldname] = String(part.value ?? "");
          continue;
        }

        if (uploadedFile) {
          removeUploadedFileIfExists(uploadedFile.targetPath);
          return reply.code(400).send({ error: "Only one file is supported per request" });
        }

        const originalName = sanitizeFileName(part.filename || "upload");
        const fileExt = path.extname(originalName).slice(1).toLowerCase();

        if (!isSupportedBookExt(fileExt)) {
          return reply.code(400).send({ error: "Only EPUB and PDF are supported" });
        }

        const datePrefix = new Date().toISOString().slice(0, 10);
        const targetDir = path.join(config.booksDir, datePrefix);
        fs.mkdirSync(targetDir, { recursive: true });

        const fileBaseName = `${Date.now()}-${originalName}`;
        const targetPath = dedupePath(path.join(targetDir, fileBaseName));
        const writeStream = fs.createWriteStream(targetPath);

        await pipeline(part.file, writeStream);

        uploadedFile = {
          originalName,
          fileExt,
          targetPath
        };
      }

      if (!uploadedFile) {
        return reply.code(400).send({ error: "No file provided" });
      }

      const stat = fs.statSync(uploadedFile.targetPath);
      if (stat.size > maxBytes) {
        fs.rmSync(uploadedFile.targetPath, { force: true });
        return reply.code(413).send({ error: `File exceeds ${maxBytes} bytes limit` });
      }

      let collectionIds: number[] = [];
      if (fields.collectionIds) {
        try {
          collectionIds = z.array(z.coerce.number().int().positive()).parse(JSON.parse(fields.collectionIds));
        } catch {
          removeUploadedFileIfExists(uploadedFile.targetPath);
          return reply.code(400).send({ error: "Invalid collectionIds payload" });
        }

        const uniqueCollectionIds = [...new Set(collectionIds)];
        if (uniqueCollectionIds.length > 0) {
          const valid = await db
            .select({ id: collections.id })
            .from(collections)
            .where(
              and(
                eq(collections.userId, request.auth.userId),
                inArray(collections.id, uniqueCollectionIds)
              )
            );

          if (valid.length !== uniqueCollectionIds.length) {
            removeUploadedFileIfExists(uploadedFile.targetPath);
            return reply.code(400).send({ error: "One or more collectionIds are invalid for this user" });
          }
        }

        collectionIds = uniqueCollectionIds;
      }

      const titleField = fields.title?.trim();
      const title = titleField ? titleField : undefined;
      const author = normalizeOptionalText(fields.author);
      const series = normalizeOptionalText(fields.series);
      const description = normalizeOptionalText(fields.description);
      const coverPath = normalizeOptionalText(fields.coverPath);
      const favorite = parseBooleanField(fields.favorite, false);
      const autoMetadata = parseBooleanField(fields.autoMetadata, true);

      const jobId = randomToken();
      const relativeFilePath = path.relative(config.booksDir, uploadedFile.targetPath);

      try {
        await queueUploadJob({
          id: jobId,
          userId: request.auth.userId,
          fileName: uploadedFile.originalName,
          filePath: relativeFilePath,
          fileSize: stat.size,
          fileExt: uploadedFile.fileExt,
          controls: {
            title,
            author,
            series,
            description,
            coverPath,
            collectionIds,
            favorite,
            autoMetadata
          }
        });
      } catch {
        removeUploadedFileIfExists(uploadedFile.targetPath);
        throw new Error("Failed to queue upload job");
      }

      return reply.code(202).send({
        jobId,
        status: "QUEUED"
      });
    }
  );
};
