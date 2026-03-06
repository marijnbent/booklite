import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { FastifyPluginAsync } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getAuth, requireAuth } from "../auth/guards";
import { config } from "../config";
import { isSupportedBookExt } from "../services/books";
import { randomToken } from "../utils/hash";
import { queueUploadJob, getUploadLimitBytes } from "../services/jobs";
import { db } from "../db/client";
import { collections } from "../db/schema";
import { logAdminActivity } from "../services/adminActivityLog";

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

const drainFile = async (stream: NodeJS.ReadableStream): Promise<void> => {
  for await (const _chunk of stream) {
    // Drain discarded parts so multipart parsing can continue.
  }
};

type StoredUploadFile = {
  clientId: string;
  originalName: string;
  fileExt: string;
  targetPath: string;
  fileSize: number;
};

type UploadDraftInput = {
  id: string;
  title?: string;
  author?: string;
  series?: string;
  description?: string;
  coverPath?: string;
  favorite?: boolean;
  autoMetadata?: boolean;
  collectionIds?: number[];
};

const batchDraftSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      title: z.string().optional(),
      author: z.string().optional(),
      series: z.string().optional(),
      description: z.string().optional(),
      coverPath: z.string().optional(),
      favorite: z.boolean().optional(),
      autoMetadata: z.boolean().optional(),
      collectionIds: z.array(z.coerce.number().int().positive()).optional()
    })
  )
  .superRefine((drafts, ctx) => {
    const seen = new Set<string>();
    drafts.forEach((draft, index) => {
      if (!seen.has(draft.id)) {
        seen.add(draft.id);
        return;
      }

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate draft id: ${draft.id}`,
        path: [index, "id"]
      });
    });
  });

const validateCollectionIds = async (userId: number, collectionIds: number[]): Promise<number[]> => {
  const uniqueCollectionIds = [...new Set(collectionIds)];
  if (uniqueCollectionIds.length === 0) return uniqueCollectionIds;

  const valid = await db
    .select({ id: collections.id })
    .from(collections)
    .where(
      and(
        eq(collections.userId, userId),
        inArray(collections.id, uniqueCollectionIds)
      )
    );

  if (valid.length !== uniqueCollectionIds.length) {
    throw new Error("One or more collectionIds are invalid for this user");
  }

  return uniqueCollectionIds;
};

const queueStoredUpload = async (input: {
  userId: number;
  storedFile: StoredUploadFile;
  draft: Omit<UploadDraftInput, "id">;
  maxBytes: number;
}): Promise<{ jobId: string; status: "QUEUED" }> => {
  if (input.storedFile.fileSize > input.maxBytes) {
    removeUploadedFileIfExists(input.storedFile.targetPath);
    throw new Error(`File exceeds ${input.maxBytes} bytes limit`);
  }

  const collectionIds = await validateCollectionIds(
    input.userId,
    input.draft.collectionIds ?? []
  );

  const titleField = input.draft.title?.trim();
  const title = titleField ? titleField : undefined;
  const author = normalizeOptionalText(input.draft.author);
  const series = normalizeOptionalText(input.draft.series);
  const description = normalizeOptionalText(input.draft.description);
  const coverPath = normalizeOptionalText(input.draft.coverPath);
  const favorite = input.draft.favorite ?? false;
  const autoMetadata = input.draft.autoMetadata ?? true;

  const jobId = randomToken();
  const relativeFilePath = path.relative(config.booksDir, input.storedFile.targetPath);

  try {
    await queueUploadJob({
      id: jobId,
      userId: input.userId,
      fileName: input.storedFile.originalName,
      filePath: relativeFilePath,
      fileSize: input.storedFile.fileSize,
      fileExt: input.storedFile.fileExt,
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
    removeUploadedFileIfExists(input.storedFile.targetPath);
    throw new Error("Failed to queue upload job");
  }

  return {
    jobId,
    status: "QUEUED"
  };
};

export const uploadRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/v1/uploads",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = getAuth(request);
      const fields: Record<string, string> = {};
      const uploadedFiles = new Map<string, StoredUploadFile>();
      const fileErrors = new Map<string, string>();
      const maxBytes = await getUploadLimitBytes();

      for await (const part of request.parts()) {
        if (part.type === "field") {
          fields[part.fieldname] = String(part.value ?? "");
          continue;
        }

        const clientId = part.fieldname.startsWith("file:")
          ? part.fieldname.slice("file:".length).trim()
          : "__single__";

        if (clientId.length === 0) {
          await drainFile(part.file);
          continue;
        }

        if (uploadedFiles.has(clientId) || fileErrors.has(clientId)) {
          await drainFile(part.file);
          fileErrors.set(clientId, "Only one file is allowed per draft");
          continue;
        }

        const originalName = sanitizeFileName(part.filename || "upload");
        const fileExt = path.extname(originalName).slice(1).toLowerCase();

        if (!isSupportedBookExt(fileExt)) {
          await drainFile(part.file);
          fileErrors.set(clientId, "Only EPUB and PDF are supported");
          continue;
        }

        const datePrefix = new Date().toISOString().slice(0, 10);
        const targetDir = path.join(config.booksDir, datePrefix);
        fs.mkdirSync(targetDir, { recursive: true });

        const fileBaseName = `${Date.now()}-${originalName}`;
        const targetPath = dedupePath(path.join(targetDir, fileBaseName));
        const writeStream = fs.createWriteStream(targetPath);

        await pipeline(part.file, writeStream);

        const stat = fs.statSync(targetPath);
        uploadedFiles.set(clientId, {
          clientId,
          originalName,
          fileExt,
          targetPath,
          fileSize: stat.size
        });
      }

      if (fields.drafts) {
        let drafts: UploadDraftInput[];
        try {
          drafts = batchDraftSchema.parse(JSON.parse(fields.drafts));
        } catch (error) {
          await logAdminActivity({
            scope: "upload",
            event: "upload.invalid_drafts_payload",
            level: "WARN",
            message: "Upload batch drafts payload could not be parsed",
            actorUserId: userId,
            details: {
              draftsLength: fields.drafts.length,
              uploadedFileCount: uploadedFiles.size,
              error
            }
          });
          uploadedFiles.forEach((storedFile) => removeUploadedFileIfExists(storedFile.targetPath));
          return reply.code(400).send({ error: "Invalid drafts payload" });
        }

        const results: Array<{
          id: string;
          title: string;
          fileName: string;
          jobId?: string;
          status?: "QUEUED";
          error?: string;
        }> = [];

        const referencedIds = new Set<string>();

        for (const draft of drafts) {
          referencedIds.add(draft.id);
          const storedFile = uploadedFiles.get(draft.id);
          const fileName = storedFile?.originalName ?? "upload";
          const title = draft.title?.trim() || path.parse(fileName).name || "Untitled";

          if (fileErrors.has(draft.id)) {
            if (storedFile) removeUploadedFileIfExists(storedFile.targetPath);
            results.push({
              id: draft.id,
              title,
              fileName,
              error: fileErrors.get(draft.id)
            });
            continue;
          }

          if (!storedFile) {
            results.push({
              id: draft.id,
              title,
              fileName,
              error: "Missing file for draft"
            });
            continue;
          }

          try {
            const queued = await queueStoredUpload({
              userId,
              storedFile,
              draft,
              maxBytes
            });

            results.push({
              id: draft.id,
              title,
              fileName: storedFile.originalName,
              jobId: queued.jobId,
              status: queued.status
            });
          } catch (error) {
            removeUploadedFileIfExists(storedFile.targetPath);
            await logAdminActivity({
              scope: "upload",
              event: "upload.batch_queue_failed",
              message: "Failed to queue batch upload draft",
              actorUserId: userId,
              details: {
                draftId: draft.id,
                title,
                fileName: storedFile.originalName,
                fileExt: storedFile.fileExt,
                fileSize: storedFile.fileSize,
                error
              }
            });
            results.push({
              id: draft.id,
              title,
              fileName: storedFile.originalName,
              error: error instanceof Error ? error.message : "Upload failed"
            });
          }
        }

        uploadedFiles.forEach((storedFile, clientId) => {
          if (referencedIds.has(clientId)) return;
          removeUploadedFileIfExists(storedFile.targetPath);
        });

        return reply.code(202).send({ results });
      }

      const uploadedFile = uploadedFiles.get("__single__");
      if (fileErrors.has("__single__")) {
        if (uploadedFile) removeUploadedFileIfExists(uploadedFile.targetPath);
        return reply.code(400).send({ error: fileErrors.get("__single__") });
      }

      if (!uploadedFile) {
        return reply.code(400).send({ error: "No file provided" });
      }

      if (uploadedFiles.size > 1 || uploadedFiles.get("__single__") === undefined) {
        uploadedFiles.forEach((storedFile) => {
          if (storedFile.clientId !== "__single__") {
            removeUploadedFileIfExists(storedFile.targetPath);
          }
        });
      }

      let collectionIds: number[] | undefined;
      if (fields.collectionIds !== undefined) {
        try {
          collectionIds = z.array(z.coerce.number().int().positive()).parse(JSON.parse(fields.collectionIds));
        } catch (error) {
          await logAdminActivity({
            scope: "upload",
            event: "upload.invalid_collection_ids_payload",
            level: "WARN",
            message: "Upload collectionIds payload could not be parsed",
            actorUserId: userId,
            details: {
              collectionIdsLength: fields.collectionIds.length,
              fileName: uploadedFile.originalName,
              error
            }
          });
          removeUploadedFileIfExists(uploadedFile.targetPath);
          return reply.code(400).send({ error: "Invalid collectionIds payload" });
        }
      }

      try {
        const queued = await queueStoredUpload({
          userId,
          storedFile: uploadedFile,
          draft: {
            title: fields.title,
            author: fields.author,
            series: fields.series,
            description: fields.description,
            coverPath: fields.coverPath,
            collectionIds,
            favorite: parseBooleanField(fields.favorite, false),
            autoMetadata: parseBooleanField(fields.autoMetadata, true)
          },
          maxBytes
        });

        return reply.code(202).send(queued);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        await logAdminActivity({
          scope: "upload",
          event: "upload.queue_failed",
          message: "Failed to queue upload",
          actorUserId: userId,
          details: {
            title: fields.title?.trim() || path.parse(uploadedFile.originalName).name,
            fileName: uploadedFile.originalName,
            fileExt: uploadedFile.fileExt,
            fileSize: uploadedFile.fileSize,
            error
          }
        });
        const statusCode = message.startsWith("File exceeds ") ? 413 : 400;
        return reply.code(statusCode).send({ error: message });
      }
    }
  );
};
