import path from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, getSetting, walCheckpoint } from "../db/client";
import { books, collectionBooks, collections, importJobs } from "../db/schema";
import { nowIso } from "../utils/time";
import { fetchMetadataWithFallback } from "./metadata";
import { filenameToBasicMetadata } from "./books";
import { resolveFilenameMetadata } from "./filenameNormalizer";
import { getFavoritesCollectionId } from "./systemCollections";

let running = false;

interface UploadControls {
  title?: string;
  author?: string;
  series?: string;
  description?: string;
  coverPath?: string;
  collectionIds: number[];
  favorite: boolean;
  autoMetadata: boolean;
}

const touchCollections = async (collectionIds: number[]): Promise<void> => {
  if (collectionIds.length === 0) return;
  await db
    .update(collections)
    .set({ updatedAt: nowIso() })
    .where(inArray(collections.id, collectionIds));
};

const normalizeForMatch = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const isSameText = (left: string | null | undefined, right: string | null | undefined): boolean => {
  const normalizedLeft = normalizeForMatch(left);
  const normalizedRight = normalizeForMatch(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
};

const getRawFileTitle = (fileName: string): string => path.parse(fileName).name;

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
    controls?: UploadControls;
  };

  const controls: UploadControls = {
    title: payload.controls?.title,
    author: payload.controls?.author,
    series: payload.controls?.series,
    description: payload.controls?.description,
    coverPath: payload.controls?.coverPath,
    collectionIds: payload.controls?.collectionIds ?? [],
    favorite: payload.controls?.favorite ?? false,
    autoMetadata: payload.controls?.autoMetadata ?? true
  };

  const normalizedControlTitle = controls.title?.trim() || undefined;
  const normalizedControlAuthor = controls.author?.trim() || undefined;
  const normalizedControlSeries = controls.series?.trim() || undefined;
  const normalizedControlDescription = controls.description?.trim() || undefined;
  const normalizedControlCoverPath = controls.coverPath?.trim() || undefined;
  const rawFileTitle = getRawFileTitle(payload.fileName);

  let defaults = filenameToBasicMetadata(payload.fileName);

  const shouldTryAiFilenameResolution =
    !normalizedControlTitle || isSameText(normalizedControlTitle, rawFileTitle);

  if (shouldTryAiFilenameResolution) {
    try {
      defaults = await resolveFilenameMetadata(payload.fileName);
    } catch {
      defaults = filenameToBasicMetadata(payload.fileName);
    }
  }

  const timestamp = nowIso();

  const titleExplicit = Boolean(
    normalizedControlTitle &&
      !isSameText(normalizedControlTitle, rawFileTitle) &&
      !isSameText(normalizedControlTitle, defaults.title)
  );
  const authorExplicit = normalizedControlAuthor !== undefined;
  const descriptionExplicit = normalizedControlDescription !== undefined;

  const resolvedTitle = normalizedControlTitle ?? defaults.title;
  const resolvedAuthor = authorExplicit
    ? normalizedControlAuthor ?? null
    : defaults.author;

  const [inserted] = await db
    .insert(books)
    .values({
      ownerUserId: job.userId,
      title: resolvedTitle,
      author: resolvedAuthor,
      series: normalizedControlSeries ?? defaults.series ?? null,
      description: normalizedControlDescription ?? null,
      coverPath: normalizedControlCoverPath ?? null,
      filePath: payload.filePath,
      fileExt: payload.fileExt,
      fileSize: payload.fileSize,
      koboSyncable: payload.fileExt.toLowerCase() === "epub" ? 1 : 0,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .returning({
      id: books.id,
      title: books.title,
      author: books.author,
      series: books.series,
      description: books.description,
      coverPath: books.coverPath
    });

  if (controls.autoMetadata) {
    try {
        const metadata = await fetchMetadataWithFallback(inserted.title, inserted.author ?? undefined);
        if (metadata.source !== "NONE") {
          const set: Record<string, unknown> = {};

        if (!titleExplicit && metadata.title && metadata.title !== inserted.title) {
          set.title = metadata.title;
        }

        if (!authorExplicit && metadata.author && metadata.author !== inserted.author) {
          set.author = metadata.author;
        }

        if (
          !descriptionExplicit &&
          metadata.description &&
          metadata.description !== inserted.description
        ) {
          set.description = metadata.description;
        }

        if (!inserted.series && metadata.series) {
          set.series = metadata.series;
        }

        if (!inserted.coverPath && metadata.coverPath) {
          set.coverPath = metadata.coverPath;
        }

        if (Object.keys(set).length > 0) {
          set.updatedAt = nowIso();
          await db.update(books).set(set).where(eq(books.id, inserted.id));
        }
      }
    } catch {
      // metadata is non-critical for upload completion
    }
  }

  const targetCollectionIds = [...new Set(controls.collectionIds)];
  if (controls.favorite) {
    const favoritesCollectionId = await getFavoritesCollectionId(job.userId);
    targetCollectionIds.push(favoritesCollectionId);
  }

  const uniqueCollectionIds = [...new Set(targetCollectionIds)];
  if (uniqueCollectionIds.length > 0) {
    const validCollections = await db
      .select({ id: collections.id })
      .from(collections)
      .where(
        and(
          eq(collections.userId, job.userId),
          inArray(collections.id, uniqueCollectionIds)
        )
      );

    const validSet = new Set(validCollections.map((row) => row.id));

    for (const collectionId of uniqueCollectionIds) {
      if (!validSet.has(collectionId)) continue;

      const maxSort = await db
        .select({ maxSort: sql<number>`COALESCE(MAX(${collectionBooks.sortOrder}), 0)` })
        .from(collectionBooks)
        .where(eq(collectionBooks.collectionId, collectionId));

      await db
        .insert(collectionBooks)
        .values({
          collectionId,
          bookId: inserted.id,
          sortOrder: (maxSort[0]?.maxSort ?? 0) + 1
        })
        .onConflictDoNothing();
    }

    await touchCollections(uniqueCollectionIds.filter((collectionId) => validSet.has(collectionId)));
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
  controls?: UploadControls;
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
      fileExt: input.fileExt,
      controls: {
        title: input.controls?.title,
        author: input.controls?.author,
        series: input.controls?.series,
        description: input.controls?.description,
        collectionIds: input.controls?.collectionIds ?? [],
        favorite: input.controls?.favorite ?? false,
        autoMetadata: input.controls?.autoMetadata ?? true
      }
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
