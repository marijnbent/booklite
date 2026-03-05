import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  bookProgress,
  books,
  collectionBooks,
  collections,
  koboReadingState,
  koboSyncSnapshots,
  koboUserSettings
} from "../db/schema";
import { nowIso } from "../utils/time";

const encodeSyncToken = (snapshotId: string): string =>
  Buffer.from(JSON.stringify({ snapshotId }), "utf8").toString("base64");

const parseBookIdFromImageId = (imageId: string): number | null => {
  if (imageId.startsWith("BL-")) {
    const asNum = Number.parseInt(imageId.slice(3), 10);
    return Number.isFinite(asNum) ? asNum : null;
  }
  const asNum = Number.parseInt(imageId, 10);
  return Number.isFinite(asNum) ? asNum : null;
};

export const resolveBookIdFromImageId = parseBookIdFromImageId;

export const getKoboUserByToken = async (token: string): Promise<{
  userId: number;
  syncEnabled: number;
  twoWayProgressSync: number;
  markReadingThreshold: number;
  markFinishedThreshold: number;
} | null> => {
  const result = await db
    .select({
      userId: koboUserSettings.userId,
      syncEnabled: koboUserSettings.syncEnabled,
      twoWayProgressSync: koboUserSettings.twoWayProgressSync,
      markReadingThreshold: koboUserSettings.markReadingThreshold,
      markFinishedThreshold: koboUserSettings.markFinishedThreshold
    })
    .from(koboUserSettings)
    .where(eq(koboUserSettings.token, token))
    .limit(1);

  return result[0] ?? null;
};

const buildBookMetadata = (
  token: string,
  baseUrl: string,
  book: {
    id: number;
    title: string;
    author: string | null;
    coverPath: string | null;
    updatedAt: string;
  }
): Record<string, unknown> => {
  const imageId = `BL-${book.id}`;
  return {
    RevisionId: String(book.id),
    WorkId: String(book.id),
    Title: book.title,
    Attribution: book.author ?? "Unknown",
    Description: "",
    IsPreOrder: false,
    IsSocialEnabled: false,
    IsPurchasedContent: true,
    IsHiddenFromArchive: false,
    IsInternetArchive: false,
    IsMysteryPreview: false,
    IsEligibleForKoboLove: false,
    ImageId: imageId,
    CoverImageId: imageId,
    DownloadUrls: [
      {
        Format: "application/epub+zip",
        Url: `${baseUrl}/api/kobo/${token}/v1/books/${book.id}/download`
      }
    ],
    ThumbnailUrl: `${baseUrl}/api/kobo/${token}/v1/books/${imageId}/thumbnail/120/180/false/image.jpg`,
    DateModified: book.updatedAt
  };
};

const buildEntitlement = (
  token: string,
  baseUrl: string,
  book: {
    id: number;
    title: string;
    author: string | null;
    coverPath: string | null;
    updatedAt: string;
  },
  type: "new" | "changed" | "removed"
): Record<string, unknown> => {
  const payload = {
    BookEntitlement: {
      EntitlementId: String(book.id),
      ProductId: String(book.id),
      CrossRevisionId: String(book.id),
      IsRemoved: type === "removed",
      DateModified: book.updatedAt
    },
    BookMetadata: buildBookMetadata(token, baseUrl, book)
  };

  if (type === "new") return { NewEntitlement: payload };
  if (type === "changed") return { ChangedProductMetadata: payload };
  return { ChangedEntitlement: payload };
};

const buildTagEntitlements = async (userId: number): Promise<Record<string, unknown>[]> => {
  const userCollections = await db
    .select({ id: collections.id, name: collections.name, updatedAt: collections.updatedAt })
    .from(collections)
    .where(eq(collections.userId, userId));

  if (userCollections.length === 0) return [];

  const collectionIds = userCollections.map((item) => item.id);
  const mapping = await db
    .select({
      collectionId: collectionBooks.collectionId,
      bookId: collectionBooks.bookId
    })
    .from(collectionBooks)
    .innerJoin(books, eq(collectionBooks.bookId, books.id))
    .where(
      and(
        inArray(collectionBooks.collectionId, collectionIds),
        eq(books.koboSyncable, 1)
      )
    );

  const grouped = new Map<number, number[]>();
  for (const row of mapping) {
    const existing = grouped.get(row.collectionId) ?? [];
    existing.push(row.bookId);
    grouped.set(row.collectionId, existing);
  }

  return userCollections.map((collection) => {
    const items = (grouped.get(collection.id) ?? []).map((bookId) => ({
      RevisionId: String(bookId),
      Type: "ProductRevisionTagItem"
    }));

    return {
      ChangedTag: {
        Tag: {
          Id: `BL-C-${collection.id}`,
          Name: collection.name,
          Type: "UserTag",
          LastModified: collection.updatedAt,
          Items: items
        }
      }
    };
  });
};

const buildProgressEntitlements = async (userId: number): Promise<Record<string, unknown>[]> => {
  const rows = await db
    .select({
      bookId: bookProgress.bookId,
      status: bookProgress.status,
      progressPercent: bookProgress.progressPercent,
      positionRef: bookProgress.positionRef,
      updatedAt: bookProgress.updatedAt
    })
    .from(bookProgress)
    .innerJoin(books, eq(bookProgress.bookId, books.id))
    .where(and(eq(bookProgress.userId, userId), eq(books.koboSyncable, 1)));

  return rows.map((row) => ({
    ChangedReadingState: {
      ReadingState: {
        EntitlementId: String(row.bookId),
        LastModified: row.updatedAt,
        PriorityTimestamp: row.updatedAt,
        StatusInfo: {
          LastModified: row.updatedAt,
          Status:
            row.status === "DONE"
              ? "Finished"
              : row.status === "READING"
                ? "Reading"
                : "ReadyToRead"
        },
        CurrentBookmark: {
          ProgressPercent: row.progressPercent,
          LastModified: row.updatedAt,
          Location: {
            Value: row.positionRef ?? "",
            Type: "Unknown",
            Source: "booklite"
          }
        }
      }
    }
  }));
};

export const getLibrarySyncPayload = async (
  userId: number,
  token: string,
  baseUrl: string
): Promise<{
  payload: Record<string, unknown>[];
  snapshotId: string;
}> => {
  const currentBooks = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      coverPath: books.coverPath,
      updatedAt: books.updatedAt
    })
    .from(books)
    .where(eq(books.koboSyncable, 1));

  const prevSnapshot = await db
    .select({ id: koboSyncSnapshots.id, snapshotJson: koboSyncSnapshots.snapshotJson })
    .from(koboSyncSnapshots)
    .where(eq(koboSyncSnapshots.userId, userId))
    .orderBy(desc(koboSyncSnapshots.createdAt))
    .limit(1);

  const prevMap = new Map<number, string>();
  if (prevSnapshot[0]) {
    try {
      const parsed = JSON.parse(prevSnapshot[0].snapshotJson) as Record<string, string>;
      for (const [bookId, timestamp] of Object.entries(parsed)) {
        prevMap.set(Number.parseInt(bookId, 10), timestamp);
      }
    } catch {
      // ignore malformed previous snapshot
    }
  }

  const currentMap = new Map<number, string>();
  for (const book of currentBooks) {
    currentMap.set(book.id, book.updatedAt);
  }

  const payload: Record<string, unknown>[] = [];

  for (const book of currentBooks) {
    if (!prevMap.has(book.id)) {
      payload.push(buildEntitlement(token, baseUrl, book, "new"));
      continue;
    }

    if (prevMap.get(book.id) !== book.updatedAt) {
      payload.push(buildEntitlement(token, baseUrl, book, "changed"));
    }
  }

  for (const [prevBookId, prevUpdatedAt] of prevMap.entries()) {
    if (currentMap.has(prevBookId)) continue;

    payload.push(
      buildEntitlement(
        token,
        baseUrl,
        {
          id: prevBookId,
          title: `Book ${prevBookId}`,
          author: null,
          coverPath: null,
          updatedAt: prevUpdatedAt
        },
        "removed"
      )
    );
  }

  payload.push(...(await buildTagEntitlements(userId)));
  payload.push(...(await buildProgressEntitlements(userId)));

  const snapshotId = crypto.randomUUID();
  await db.insert(koboSyncSnapshots).values({
    id: snapshotId,
    userId,
    snapshotJson: JSON.stringify(Object.fromEntries(currentMap.entries())),
    createdAt: nowIso()
  });

  return { payload, snapshotId };
};

import crypto from "node:crypto";

export const koboHeaders = {
  syncToken: "x-kobo-synctoken",
  sync: "x-kobo-sync"
};

export const buildSyncTokenHeader = (snapshotId: string): string =>
  encodeSyncToken(snapshotId);

export const getBookMetadataForKobo = async (
  bookId: number,
  token: string,
  baseUrl: string
): Promise<Record<string, unknown> | null> => {
  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      coverPath: books.coverPath,
      updatedAt: books.updatedAt
    })
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.koboSyncable, 1)))
    .limit(1);

  if (!rows[0]) return null;
  return buildBookMetadata(token, baseUrl, rows[0]);
};

export const upsertKoboReadingStates = async (
  userId: number,
  readingStates: Array<Record<string, any>>
): Promise<void> => {
  for (const state of readingStates) {
    const entitlementId = Number.parseInt(String(state.EntitlementId ?? state.entitlementId), 10);
    if (!Number.isFinite(entitlementId)) continue;

    const lastModified = String(
      state.LastModified ??
        state.lastModified ??
        state.PriorityTimestamp ??
        state.priorityTimestamp ??
        nowIso()
    );

    const progressPercentRaw =
      state.CurrentBookmark?.ProgressPercent ??
      state.currentBookmark?.progressPercent ??
      0;

    const progressPercent = Number(progressPercentRaw) || 0;
    const positionRef =
      state.CurrentBookmark?.Location?.Value ??
      state.currentBookmark?.location?.value ??
      null;

    const statusText = String(
      state.StatusInfo?.Status ?? state.statusInfo?.status ?? "ReadyToRead"
    ).toLowerCase();

    const mappedStatus =
      statusText.includes("finish")
        ? "DONE"
        : statusText.includes("read")
          ? "READING"
          : "UNREAD";

    const currentProgress = await db
      .select({ updatedAt: bookProgress.updatedAt })
      .from(bookProgress)
      .where(
        and(eq(bookProgress.userId, userId), eq(bookProgress.bookId, entitlementId))
      )
      .limit(1);

    if (
      currentProgress[0] &&
      new Date(currentProgress[0].updatedAt).getTime() > new Date(lastModified).getTime()
    ) {
      continue;
    }

    await db
      .insert(bookProgress)
      .values({
        userId,
        bookId: entitlementId,
        status: mappedStatus as "UNREAD" | "READING" | "DONE",
        progressPercent,
        positionRef,
        updatedAt: lastModified
      })
      .onConflictDoUpdate({
        target: [bookProgress.userId, bookProgress.bookId],
        set: {
          status: mappedStatus as "UNREAD" | "READING" | "DONE",
          progressPercent,
          positionRef,
          updatedAt: lastModified
        }
      });

    await db
      .insert(koboReadingState)
      .values({
        userId,
        bookId: entitlementId,
        payloadJson: JSON.stringify(state),
        lastModifiedAt: lastModified
      })
      .onConflictDoUpdate({
        target: [koboReadingState.userId, koboReadingState.bookId],
        set: {
          payloadJson: JSON.stringify(state),
          lastModifiedAt: lastModified
        }
      });
  }
};

export const getKoboReadingState = async (
  userId: number,
  bookId: number
): Promise<Record<string, unknown> | null> => {
  const row = await db
    .select({ payloadJson: koboReadingState.payloadJson })
    .from(koboReadingState)
    .where(and(eq(koboReadingState.userId, userId), eq(koboReadingState.bookId, bookId)))
    .limit(1);

  if (row[0]) {
    return JSON.parse(row[0].payloadJson) as Record<string, unknown>;
  }

  const progress = await db
    .select({
      status: bookProgress.status,
      progressPercent: bookProgress.progressPercent,
      positionRef: bookProgress.positionRef,
      updatedAt: bookProgress.updatedAt
    })
    .from(bookProgress)
    .where(and(eq(bookProgress.userId, userId), eq(bookProgress.bookId, bookId)))
    .limit(1);

  if (!progress[0]) return null;

  const timestamp = progress[0].updatedAt;
  return {
    EntitlementId: String(bookId),
    LastModified: timestamp,
    PriorityTimestamp: timestamp,
    StatusInfo: {
      LastModified: timestamp,
      Status:
        progress[0].status === "DONE"
          ? "Finished"
          : progress[0].status === "READING"
            ? "Reading"
            : "ReadyToRead"
    },
    CurrentBookmark: {
      ProgressPercent: progress[0].progressPercent,
      LastModified: timestamp,
      Location: {
        Value: progress[0].positionRef ?? "",
        Type: "Unknown",
        Source: "booklite"
      }
    }
  };
};
