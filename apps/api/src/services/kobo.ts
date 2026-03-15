import fs from "node:fs";
import path from "node:path";
import type { ReadStatus } from "@booklite/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { config } from "../config";
import {
  bookProgress,
  books,
  collectionBooks,
  collections,
  koboPendingRedeliveries,
  koboReadingState,
  koboSyncCollections,
  koboSyncSnapshots,
  koboUserSettings
} from "../db/schema";
import { nowIso } from "../utils/time";
import crypto from "node:crypto";

const encodeSyncToken = (snapshotId: string): string =>
  Buffer.from(JSON.stringify({ snapshotId }), "utf8").toString("base64");

const parseSnapshotJsonToMap = (snapshotJson: string): Map<number, string> => {
  const map = new Map<number, string>();
  try {
    const parsed = JSON.parse(snapshotJson) as Record<string, string>;
    for (const [bookId, timestamp] of Object.entries(parsed)) {
      const parsedBookId = Number.parseInt(bookId, 10);
      if (!Number.isFinite(parsedBookId) || typeof timestamp !== "string") continue;
      map.set(parsedBookId, timestamp);
    }
  } catch {
    // ignore malformed snapshot payloads
  }
  return map;
};

const getSnapshotBookMap = async (
  userId: number,
  options: { baselineSnapshotId?: string; forceFullSync?: boolean }
): Promise<Map<number, string>> => {
  if (options.forceFullSync) return new Map<number, string>();

  if (options.baselineSnapshotId) {
    const byId = await db
      .select({ snapshotJson: koboSyncSnapshots.snapshotJson })
      .from(koboSyncSnapshots)
      .where(
        and(
          eq(koboSyncSnapshots.userId, userId),
          eq(koboSyncSnapshots.id, options.baselineSnapshotId)
        )
      )
      .limit(1);

    if (!byId[0]) return new Map<number, string>();
    return parseSnapshotJsonToMap(byId[0].snapshotJson);
  }

  const latest = await db
    .select({ snapshotJson: koboSyncSnapshots.snapshotJson })
    .from(koboSyncSnapshots)
    .where(eq(koboSyncSnapshots.userId, userId))
    .orderBy(desc(koboSyncSnapshots.createdAt))
    .limit(1);

  if (!latest[0]) return new Map<number, string>();
  return parseSnapshotJsonToMap(latest[0].snapshotJson);
};

const buildCoverImageId = (bookId: number, updatedAt?: string): string => {
  if (!updatedAt) return `BL-${bookId}`;
  const version = crypto
    .createHash("sha1")
    .update(updatedAt)
    .digest("hex")
    .slice(0, 12);
  return `BL-${bookId}-${version}`;
};

const parseBookIdFromImageId = (imageId: string): number | null => {
  const prefixedMatch = /^BL-(\d+)(?:[-/].*)?$/.exec(imageId);
  if (prefixedMatch) {
    const asNum = Number.parseInt(prefixedMatch[1], 10);
    return Number.isFinite(asNum) ? asNum : null;
  }

  const numericMatch = /^(\d+)(?:[-/].*)?$/.exec(imageId);
  if (numericMatch) {
    const asNum = Number.parseInt(numericMatch[1], 10);
    return Number.isFinite(asNum) ? asNum : null;
  }

  return null;
};

export const resolveBookIdFromImageId = parseBookIdFromImageId;

const statusToKoboStatus = (status: ReadStatus): "Finished" | "Reading" | "ReadyToRead" => {
  if (status === "READ") return "Finished";
  if (status === "READING" || status === "RE_READING" || status === "PARTIALLY_READ" || status === "PAUSED") {
    return "Reading";
  }
  return "ReadyToRead";
};

const mapKoboStatusToReadStatus = (statusText: string): ReadStatus => {
  if (statusText.includes("finish")) return "READ";
  if (statusText.includes("ready")) return "UNREAD";
  if (statusText.includes("reading")) return "READING";
  return "UNREAD";
};

const isSqliteForeignKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY";

export const getKoboUserByToken = async (token: string): Promise<{
  userId: number;
  syncEnabled: number;
  syncAllBooks: number;
  twoWayProgressSync: number;
  markReadingThreshold: number;
  markFinishedThreshold: number;
} | null> => {
  const result = await db
    .select({
      userId: koboUserSettings.userId,
      syncEnabled: koboUserSettings.syncEnabled,
      syncAllBooks: koboUserSettings.syncAllBooks,
      twoWayProgressSync: koboUserSettings.twoWayProgressSync,
      markReadingThreshold: koboUserSettings.markReadingThreshold,
      markFinishedThreshold: koboUserSettings.markFinishedThreshold
    })
    .from(koboUserSettings)
    .where(eq(koboUserSettings.token, token))
    .limit(1);

  return result[0] ?? null;
};

const isSyncAllBooks = async (userId: number): Promise<boolean> => {
  const result = await db
    .select({ syncAllBooks: koboUserSettings.syncAllBooks })
    .from(koboUserSettings)
    .where(eq(koboUserSettings.userId, userId))
    .limit(1);
  return Boolean(result[0]?.syncAllBooks);
};

const getSelectedSyncCollections = async (
  userId: number
): Promise<Array<{ id: number; name: string; updatedAt: string }>> =>
  db
    .select({
      id: collections.id,
      name: collections.name,
      updatedAt: collections.updatedAt
    })
    .from(koboSyncCollections)
    .innerJoin(
      collections,
      and(
        eq(collections.id, koboSyncCollections.collectionId),
        eq(collections.userId, userId)
      )
    )
    .where(eq(koboSyncCollections.userId, userId));

type SyncedBook = {
  id: number;
  title: string;
  author: string | null;
  series: string | null;
  description: string | null;
  coverPath: string | null;
  createdAt: string;
  updatedAt: string;
  filePath: string;
  fileSize: number | null;
};

const getSyncedBooksForUser = async (userId: number): Promise<SyncedBook[]> => {
  if (await isSyncAllBooks(userId)) {
    const rows = await db.all(
      sql`
        SELECT b.id, b.title, b.author, b.series, b.description, b.cover_path AS coverPath, b.created_at AS createdAt, b.updated_at AS updatedAt, b.file_path AS filePath, b.file_size AS fileSize
        FROM books b
        WHERE b.owner_user_id = ${userId}
          AND lower(b.file_ext) IN ('epub', 'kepub')
      `
    );
    return rows as SyncedBook[];
  }

  const rows = await db.all(
      sql`
      SELECT DISTINCT b.id, b.title, b.author, b.series, b.description, b.cover_path AS coverPath, b.created_at AS createdAt, b.updated_at AS updatedAt, b.file_path AS filePath, b.file_size AS fileSize
      FROM kobo_sync_collections ksc
      JOIN collections c ON c.id = ksc.collection_id
      JOIN collection_books cb ON cb.collection_id = c.id
      JOIN books b ON b.id = cb.book_id
      WHERE ksc.user_id = ${userId}
        AND c.user_id = ${userId}
        AND lower(b.file_ext) IN ('epub', 'kepub')
    `
  );
  return rows as SyncedBook[];
};

const getPendingKoboRedeliveryBookIds = async (userId: number): Promise<number[]> => {
  const rows = await db
    .select({ bookId: koboPendingRedeliveries.bookId })
    .from(koboPendingRedeliveries)
    .where(eq(koboPendingRedeliveries.userId, userId));

  return rows.map((row) => row.bookId);
};

const clearPendingKoboRedeliveries = async (
  userId: number,
  bookIds: number[]
): Promise<void> => {
  if (bookIds.length === 0) return;

  await db
    .delete(koboPendingRedeliveries)
    .where(
      and(
        eq(koboPendingRedeliveries.userId, userId),
        inArray(koboPendingRedeliveries.bookId, bookIds)
      )
    );
};

export const isBookInKoboSyncScope = async (userId: number, bookId: number): Promise<boolean> => {
  if (await isSyncAllBooks(userId)) {
    const rows = await db.all<{ id: number }>(
      sql`
        SELECT b.id FROM books b
        WHERE b.owner_user_id = ${userId}
          AND b.id = ${bookId}
          AND lower(b.file_ext) IN ('epub', 'kepub')
        LIMIT 1
      `
    );
    return Boolean(rows[0]);
  }

  const rows = await db.all<{ id: number }>(
    sql`
      SELECT b.id
      FROM kobo_sync_collections ksc
      JOIN collections c ON c.id = ksc.collection_id
      JOIN collection_books cb ON cb.collection_id = c.id
      JOIN books b ON b.id = cb.book_id
      WHERE ksc.user_id = ${userId}
        AND c.user_id = ${userId}
        AND b.id = ${bookId}
        AND lower(b.file_ext) IN ('epub', 'kepub')
      LIMIT 1
    `
  );

  return Boolean(rows[0]);
};

const buildBookMetadata = (
  token: string,
  baseUrl: string,
  book: {
    id: number;
    title: string;
    author: string | null;
    series?: string | null;
    description?: string | null;
    coverPath: string | null;
    createdAt?: string;
    updatedAt: string;
    filePath?: string;
    fileSize?: number | null;
  }
): Record<string, unknown> => {
  let fileSize = book.fileSize ?? 0;
  if (fileSize <= 0 && typeof book.filePath === "string" && book.filePath.length > 0) {
    const absolutePath = path.isAbsolute(book.filePath)
      ? book.filePath
      : path.join(config.booksDir, book.filePath);
    try {
      fileSize = fs.statSync(absolutePath).size;
    } catch {
      fileSize = 0;
    }
  }

  const imageId = buildCoverImageId(book.id, book.updatedAt);
  const slug = book.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const series = book.series
    ? {
        Id: `series_${book.series.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        Name: book.series,
        Number: "1",
        NumberFloat: 1
      }
    : {
        Id: "",
        Name: "",
        Number: "",
        NumberFloat: 0
      };

  return {
    CrossRevisionId: String(book.id),
    RevisionId: String(book.id),
    EntitlementId: String(book.id),
    WorkId: String(book.id),
    ...(slug ? { Slug: slug } : {}),
    Title: book.title,
    ...(book.description ? { Description: book.description } : {}),
    Contributors: book.author ? [book.author] : [],
    ContributorRoles: [],
    ExternalIds: [],
    Language: "en",
    Series: series,
    Categories: ["00000000-0000-0000-0000-000000000001"],
    IsPreOrder: false,
    IsSocialEnabled: true,
    IsInternetArchive: false,
    IsEligibleForKoboLove: false,
    CoverImageId: imageId,
    DownloadUrls: [
      {
        DrmType: "None",
        Format: "EPUB3",
        Url: `${baseUrl}/api/kobo/${token}/v1/books/${book.id}/download`,
        Size: fileSize,
        Platform: "Generic"
      }
    ],
    CurrentDisplayPrice: {
      TotalAmount: 0,
      CurrencyCode: "USD"
    },
    CurrentLoveDisplayPrice: {
      TotalAmount: 0
    },
    PhoneticPronunciations: {},
  };
};

const buildRemovedBookMetadata = (bookId: number): Record<string, unknown> => ({
  CrossRevisionId: String(bookId),
  RevisionId: String(bookId),
  EntitlementId: String(bookId),
  WorkId: String(bookId),
  CoverImageId: buildCoverImageId(bookId),
  Title: String(bookId)
});

const buildDefaultReadingState = (
  bookId: number,
  modifiedAt: string
): Record<string, unknown> => ({
  EntitlementId: String(bookId),
  Created: modifiedAt,
  LastModified: modifiedAt,
  PriorityTimestamp: modifiedAt,
  StatusInfo: {
    LastModified: modifiedAt,
    Status: "ReadyToRead",
    TimesStartedReading: 0
  },
  CurrentBookmark: {
    ProgressPercent: 0,
    LastModified: modifiedAt,
    Location: {
      Value: "",
      Type: "Unknown",
      Source: "booklite"
    }
  },
  Statistics: {
    LastModified: modifiedAt
  }
});

const buildEntitlement = (
  token: string,
  baseUrl: string,
  book: {
    id: number;
    title: string;
    author: string | null;
    series?: string | null;
    description?: string | null;
    coverPath: string | null;
    createdAt?: string;
    updatedAt: string;
    fileSize?: number | null;
  },
  type: "new" | "changed" | "removed"
): Record<string, unknown> => {
  const modifiedAt = book.updatedAt || nowIso();
  const createdAt = book.createdAt || modifiedAt;
  const payload = {
    BookEntitlement: {
      ActivePeriod: {
        From: nowIso()
      },
      Status: "Active",
      Accessibility: "Full",
      CrossRevisionId: String(book.id),
      RevisionId: String(book.id),
      Id: String(book.id),
      Created: createdAt,
      LastModified: modifiedAt,
      IsHiddenFromArchive: false,
      IsLocked: false,
      OriginCategory: "Imported",
      IsRemoved: type === "removed",
      ...(type === "removed" ? { IsDeleted: true } : {})
    },
    BookMetadata:
      type === "removed"
        ? buildRemovedBookMetadata(book.id)
        : buildBookMetadata(token, baseUrl, book)
  };

  if (type === "new") {
    return {
      NewEntitlement: {
        ...payload,
        ReadingState: buildDefaultReadingState(book.id, modifiedAt)
      }
    };
  }
  if (type === "changed") return { ChangedProductMetadata: payload };
  return { ChangedEntitlement: payload };
};

const buildTagEntitlements = async (userId: number): Promise<Record<string, unknown>[]> => {
  const selectedCollections = await getSelectedSyncCollections(userId);
  if (selectedCollections.length === 0) return [];

  const collectionIds = selectedCollections.map((item) => item.id);
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
        sql`lower(${books.fileExt}) IN ('epub', 'kepub')`
      )
    );

  const grouped = new Map<number, number[]>();
  for (const row of mapping) {
    const existing = grouped.get(row.collectionId) ?? [];
    existing.push(row.bookId);
    grouped.set(row.collectionId, existing);
  }

  return selectedCollections.map((collection) => {
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
  const syncedBooks = await getSyncedBooksForUser(userId);
  const syncedBookIds = syncedBooks.map((book) => book.id);
  if (syncedBookIds.length === 0) return [];

  const rows = await db
    .select({
      bookId: bookProgress.bookId,
      status: bookProgress.status,
      progressPercent: bookProgress.progressPercent,
      positionRef: bookProgress.positionRef,
      positionType: bookProgress.positionType,
      positionSource: bookProgress.positionSource,
      updatedAt: bookProgress.updatedAt
    })
    .from(bookProgress)
    .where(
      and(eq(bookProgress.userId, userId), inArray(bookProgress.bookId, syncedBookIds))
    );

  return rows.map((row) => ({
    ChangedReadingState: {
      ReadingState: {
        EntitlementId: String(row.bookId),
        LastModified: row.updatedAt,
        PriorityTimestamp: row.updatedAt,
        StatusInfo: {
          LastModified: row.updatedAt,
          Status:
            row.status === "READ"
              ? "Finished"
              : row.status === "READING"
                ? "Reading"
                : "ReadyToRead"
        },
        CurrentBookmark: {
          ProgressPercent: row.progressPercent,
          LastModified: row.updatedAt,
          ...(row.positionRef
            ? {
                Location: {
                  Value: row.positionRef,
                  Type: row.positionType ?? "Unknown",
                  Source: row.positionSource ?? ""
                }
              }
            : {})
        }
      }
    }
  }));
};

export const getLibrarySyncPayload = async (
  userId: number,
  token: string,
  baseUrl: string,
  options: { baselineSnapshotId?: string; forceFullSync?: boolean } = {}
): Promise<{
  payload: Record<string, unknown>[];
  snapshotId: string;
}> => {
  const currentBooks = await getSyncedBooksForUser(userId);
  const prevMap = await getSnapshotBookMap(userId, options);
  const pendingRedeliveryIds = new Set(await getPendingKoboRedeliveryBookIds(userId));

  const currentMap = new Map<number, string>();
  for (const book of currentBooks) {
    currentMap.set(book.id, book.updatedAt);
  }

  const payload: Record<string, unknown>[] = [];
  const consumedRedeliveryIds: number[] = [];

  for (const book of currentBooks) {
    if (pendingRedeliveryIds.has(book.id)) {
      payload.push(buildEntitlement(token, baseUrl, book, "new"));
      consumedRedeliveryIds.push(book.id);
      continue;
    }

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
          series: null,
          description: null,
          coverPath: null,
          createdAt: prevUpdatedAt,
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

  const staleRedeliveryIds = [...pendingRedeliveryIds].filter((bookId) => !currentMap.has(bookId));
  await clearPendingKoboRedeliveries(userId, [
    ...new Set([...consumedRedeliveryIds, ...staleRedeliveryIds])
  ]);

  return { payload, snapshotId };
};

export const queueKoboBookRedelivery = async (
  userId: number,
  bookId: number
): Promise<void> => {
  await db
    .insert(koboPendingRedeliveries)
    .values({
      userId,
      bookId,
      createdAt: nowIso()
    })
    .onConflictDoUpdate({
      target: [koboPendingRedeliveries.userId, koboPendingRedeliveries.bookId],
      set: {
        createdAt: nowIso()
      }
    });
};

export const koboHeaders = {
  syncToken: "x-kobo-synctoken",
  sync: "x-kobo-sync"
};

export const buildSyncTokenHeader = (snapshotId: string): string =>
  encodeSyncToken(snapshotId);

export const parseSyncTokenHeader = (
  rawHeader: string | string[] | undefined
): string | null => {
  const raw = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!raw || typeof raw !== "string") return null;

  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { snapshotId?: unknown };
    if (typeof parsed.snapshotId === "string" && parsed.snapshotId.trim().length > 0) {
      return parsed.snapshotId;
    }
    return null;
  } catch {
    return null;
  }
};

export const getBookMetadataForKobo = async (
  userId: number,
  bookId: number,
  token: string,
  baseUrl: string
): Promise<Record<string, unknown> | null> => {
  if (!(await isBookInKoboSyncScope(userId, bookId))) return null;

  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      series: books.series,
      description: books.description,
      coverPath: books.coverPath,
      createdAt: books.createdAt,
      updatedAt: books.updatedAt,
      filePath: books.filePath,
      fileSize: books.fileSize
    })
    .from(books)
    .where(eq(books.id, bookId))
    .limit(1);

  if (!rows[0]) return null;
  return buildBookMetadata(token, baseUrl, rows[0]);
};

export const upsertKoboReadingStates = async (
  userId: number,
  readingStates: Array<Record<string, any>>
): Promise<void> => {
  const scopeByBookId = new Map<number, boolean>();

  for (const state of readingStates) {
    const entitlementId = Number.parseInt(String(state.EntitlementId ?? state.entitlementId), 10);
    if (!Number.isFinite(entitlementId)) continue;

    let inSyncScope = scopeByBookId.get(entitlementId);
    if (inSyncScope === undefined) {
      inSyncScope = await isBookInKoboSyncScope(userId, entitlementId);
      scopeByBookId.set(entitlementId, inSyncScope);
    }
    if (!inSyncScope) continue;

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
    const positionType =
      state.CurrentBookmark?.Location?.Type ??
      state.currentBookmark?.location?.type ??
      null;
    const positionSource =
      state.CurrentBookmark?.Location?.Source ??
      state.currentBookmark?.location?.source ??
      null;

    const statusText = String(
      state.StatusInfo?.Status ?? state.statusInfo?.status ?? "ReadyToRead"
    ).toLowerCase();

    const mappedStatus: "UNREAD" | "READING" | "READ" =
      statusText.includes("finish")
        ? "READ"
        : statusText.includes("reading")
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

    try {
      await db
        .insert(bookProgress)
        .values({
          userId,
          bookId: entitlementId,
          status: mappedStatus,
          progressPercent,
          positionRef,
          positionType,
          positionSource,
          updatedAt: lastModified
        })
        .onConflictDoUpdate({
          target: [bookProgress.userId, bookProgress.bookId],
          set: {
            status: mappedStatus,
            progressPercent,
            positionRef,
            positionType,
            positionSource,
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
    } catch (error) {
      if (isSqliteForeignKeyError(error)) {
        continue;
      }
      throw error;
    }
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
        progress[0].status === "READ"
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
