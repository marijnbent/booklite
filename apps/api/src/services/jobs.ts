import fs from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db, getSetting, walCheckpoint } from "../db/client";
import { books, importJobs } from "../db/schema";
import { nowIso } from "../utils/time";
import { fetchMetadataWithFallback } from "./metadata";
import { filenameToBasicMetadata } from "./books";

let running = false;

const processUploadJob = async (job: {
  id: string;
  userId: number;
  payloadJson: string;
}): Promise<void> => {
  const payload = JSON.parse(job.payloadJson) as {
    fileName: string;
    filePath: string;
    fileSize: number;
    fileExt: string;
  };

  const defaults = filenameToBasicMetadata(payload.fileName);
  const timestamp = nowIso();
  const [inserted] = await db
    .insert(books)
    .values({
      ownerUserId: job.userId,
      title: defaults.title,
      author: defaults.author,
      series: null,
      description: null,
      coverPath: null,
      filePath: payload.filePath,
      fileExt: payload.fileExt,
      fileSize: payload.fileSize,
      koboSyncable: payload.fileExt.toLowerCase() === "epub" ? 1 : 0,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .returning({ id: books.id, title: books.title, author: books.author });

  try {
    const metadata = await fetchMetadataWithFallback(inserted.title, inserted.author ?? undefined);
    if (metadata.source !== "NONE") {
      await db
        .update(books)
        .set({
          title: metadata.title ?? inserted.title,
          author: metadata.author ?? inserted.author,
          description: metadata.description ?? null,
          coverPath: metadata.coverPath ?? null,
          updatedAt: nowIso()
        })
        .where(eq(books.id, inserted.id));
    }
  } catch {
    // metadata is non-critical for upload completion
  }

  await db
    .update(importJobs)
    .set({
      status: "COMPLETED",
      updatedAt: nowIso(),
      resultJson: JSON.stringify({ bookId: inserted.id })
    })
    .where(eq(importJobs.id, job.id));
};

const processOneQueuedJob = async (): Promise<void> => {
  const jobs = await db
    .select({
      id: importJobs.id,
      userId: importJobs.userId,
      type: importJobs.type,
      payloadJson: importJobs.payloadJson
    })
    .from(importJobs)
    .where(eq(importJobs.status, "QUEUED"))
    .orderBy(sql`${importJobs.createdAt} ASC`)
    .limit(1);

  const job = jobs[0];
  if (!job) return;

  await db
    .update(importJobs)
    .set({ status: "PROCESSING", updatedAt: nowIso() })
    .where(eq(importJobs.id, job.id));

  try {
    if (job.type === "UPLOAD") {
      await processUploadJob(job);
    } else {
      throw new Error(`Unknown job type: ${job.type}`);
    }
  } catch (error) {
    await db
      .update(importJobs)
      .set({
        status: "FAILED",
        updatedAt: nowIso(),
        error: error instanceof Error ? error.message : "Unknown error"
      })
      .where(eq(importJobs.id, job.id));
  }
};

export const startJobRunner = (): void => {
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await processOneQueuedJob();
      walCheckpoint();
    } finally {
      running = false;
    }
  }, 1500).unref();
};

export const queueUploadJob = async (input: {
  id: string;
  userId: number;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileExt: string;
}): Promise<void> => {
  const timestamp = nowIso();

  await db.insert(importJobs).values({
    id: input.id,
    userId: input.userId,
    status: "QUEUED",
    type: "UPLOAD",
    payloadJson: JSON.stringify({
      fileName: input.fileName,
      filePath: input.filePath,
      fileSize: input.fileSize,
      fileExt: input.fileExt
    }),
    resultJson: null,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });
};

export const getUploadLimitBytes = async (): Promise<number> => {
  const uploadLimitMb = await getSetting<number>("upload_limit_mb", 100);
  return uploadLimitMb * 1024 * 1024;
};
