import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { lookup as lookupMime } from "mime-types";
import { z } from "zod";
import { db } from "../db/client";
import { books } from "../db/schema";
import { config } from "../config";
import {
  buildSyncTokenHeader,
  getBookMetadataForKobo,
  getKoboReadingState,
  getKoboUserByToken,
  getLibrarySyncPayload,
  isBookInKoboSyncScope,
  koboHeaders,
  parseSyncTokenHeader,
  queueKoboBookRedelivery,
  resolveBookIdFromImageId,
  upsertKoboReadingStates
} from "../services/kobo";
import { koboFallbackResources } from "../services/koboFallbackResources";
import { logAdminActivity } from "../services/adminActivityLog";

const koboAuth = async (token: string) => {
  const user = await getKoboUserByToken(token);
  if (!user || !user.syncEnabled) {
    return null;
  }
  return user;
};

const placeholderJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBUVFRUWFxYVFRUVFRUVFRUWFxUVFRUYHSggGBolHRUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OFxAQGi0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAADAQAAAAAAAAAAAAAAAAAAAQMC/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAB3A//xAAVEAEBAAAAAAAAAAAAAAAAAAABAP/aAAgBAQABBQLP/8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAwEBPwEf/8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAgEBPwEf/8QAFBABAAAAAAAAAAAAAAAAAAAAEP/aAAgBAQAGPwJf/8QAFBABAAAAAAAAAAAAAAAAAAAAEP/aAAgBAQABPyFf/9oADAMBAAIAAwAAABCf/8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAwEBPxBf/8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAgEBPxBf/8QAFBABAAAAAAAAAAAAAAAAAAAAEP/aAAgBAQABPxBf/9k=",
  "base64"
);

const remoteCoverCache = new Map<
  string,
  { bytes: Buffer; contentType: string; expiresAt: number }
>();

const sendPlaceholderCover = (reply: any): any => {
  reply.header("content-type", "image/jpeg");
  reply.header("cache-control", "public, max-age=600");
  return reply.send(placeholderJpeg);
};

const respondCover = async (
  userId: number,
  imageId: string,
  reply: any
): Promise<any> => {
  const bookId = resolveBookIdFromImageId(imageId);
  if (!bookId) return reply.code(404).send({ error: "Image not found" });
  if (!(await isBookInKoboSyncScope(userId, bookId))) {
    return reply.code(404).send({ error: "Image not found" });
  }

  const row = await db
    .select({ coverPath: books.coverPath })
    .from(books)
    .where(eq(books.id, bookId))
    .limit(1);

  const coverPath = row[0]?.coverPath;
  if (!coverPath) {
    return sendPlaceholderCover(reply);
  }

  if (coverPath.startsWith("http://") || coverPath.startsWith("https://")) {
    const now = Date.now();
    const cached = remoteCoverCache.get(coverPath);
    if (cached && cached.expiresAt > now) {
      reply.header("content-type", cached.contentType);
      reply.header("cache-control", "public, max-age=600");
      return reply.send(cached.bytes);
    }

    const controller = new AbortController();
    // Keep Kobo sync responsive even when third-party cover hosts are slow.
    const timeout = setTimeout(() => controller.abort(), 750);

    try {
      const response = await fetch(coverPath, { signal: controller.signal });
      if (!response.ok) {
        await logAdminActivity({
          scope: "kobo",
          event: "kobo.cover_fetch_failed",
          level: "WARN",
          message: "Remote Kobo cover fetch returned a non-success status",
          actorUserId: userId,
          bookId,
          details: {
            imageId,
            coverPath,
            status: response.status
          }
        });
        return sendPlaceholderCover(reply);
      }

      const contentTypeRaw = response.headers.get("content-type") ?? "";
      const contentType = contentTypeRaw.toLowerCase().includes("image/")
        ? contentTypeRaw
        : "image/jpeg";
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) {
        await logAdminActivity({
          scope: "kobo",
          event: "kobo.cover_fetch_failed",
          level: "WARN",
          message: "Remote Kobo cover fetch returned an empty body",
          actorUserId: userId,
          bookId,
          details: {
            imageId,
            coverPath
          }
        });
        return sendPlaceholderCover(reply);
      }

      remoteCoverCache.set(coverPath, {
        bytes,
        contentType,
        expiresAt: now + 10 * 60 * 1000
      });

      reply.header("content-type", contentType);
      reply.header("cache-control", "public, max-age=600");
      return reply.send(bytes);
    } catch (error) {
      await logAdminActivity({
        scope: "kobo",
        event: "kobo.cover_fetch_failed",
        level: "WARN",
        message: "Remote Kobo cover fetch failed",
        actorUserId: userId,
        bookId,
        details: {
          imageId,
          coverPath,
          error
        }
      });
      return sendPlaceholderCover(reply);
    } finally {
      clearTimeout(timeout);
    }
  }

  const absolutePath = path.isAbsolute(coverPath) ? coverPath : path.join(config.booksDir, coverPath);

  if (!fs.existsSync(absolutePath)) {
    await logAdminActivity({
      scope: "kobo",
      event: "kobo.cover_file_missing",
      level: "WARN",
      message: "Local Kobo cover file is missing",
      actorUserId: userId,
      bookId,
      details: {
        imageId,
        coverPath,
        absolutePath
      }
    });
    return sendPlaceholderCover(reply);
  }

  const contentType = lookupMime(absolutePath) || "image/jpeg";
  if (typeof contentType !== "string" || !contentType.startsWith("image/")) {
    await logAdminActivity({
      scope: "kobo",
      event: "kobo.cover_invalid_content_type",
      level: "WARN",
      message: "Local Kobo cover path does not point to an image",
      actorUserId: userId,
      bookId,
      details: {
        imageId,
        coverPath,
        absolutePath,
        contentType
      }
    });
    return sendPlaceholderCover(reply);
  }

  reply.header("content-type", contentType);
  reply.header("cache-control", "public, max-age=600");
  return reply.send(fs.createReadStream(absolutePath));
};

export const koboDeviceRoutes: FastifyPluginAsync = async (fastify) => {
  // Kobo sometimes sends Content-Type: application/json with an empty body.
  // Fastify rejects this by default, but Kobo expects these requests to be accepted.
  fastify.removeContentTypeParser("application/json");
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      const text = typeof body === "string" ? body.trim() : "";
      if (text.length === 0) {
        done(null, {});
        return;
      }

      try {
        done(null, JSON.parse(text));
      } catch (error) {
        done(error as Error);
      }
    }
  );

  fastify.get("/api/kobo/:token/v1/initialization", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const baseUrl = process.env.BASE_URL ?? "http://localhost:6060";
    const localImageBase = `${baseUrl}/api/kobo/${params.token}/v1/books/{ImageId}`;

    let resources: Record<string, unknown> = { ...koboFallbackResources };
    let usedFallback = true;
    let upstreamStatus: number | null = null;
    let upstreamError: unknown = null;
    try {
      const upstreamHeaders: Record<string, string> = {
        "user-agent": request.headers["user-agent"] ?? "BookLite/1.0",
        accept: request.headers.accept ?? "application/json"
      };
      if (typeof request.headers.authorization === "string") {
        upstreamHeaders.authorization = request.headers.authorization;
      }
      if (typeof request.headers["accept-language"] === "string") {
        upstreamHeaders["accept-language"] = request.headers["accept-language"];
      }
      for (const [key, value] of Object.entries(request.headers)) {
        if (key.toLowerCase().startsWith("x-kobo-") && typeof value === "string") {
          upstreamHeaders[key] = value;
        }
      }

      const upstream = await fetch("https://storeapi.kobo.com/v1/initialization", {
        headers: upstreamHeaders
      });
      upstreamStatus = upstream.status;
      if (upstream.ok) {
        const body = (await upstream.json()) as { Resources?: Record<string, unknown> };
        if (body?.Resources && typeof body.Resources === "object") {
          resources = body.Resources;
          usedFallback = false;
        }
      }
    } catch (error) {
      upstreamError = error;
      // fall back to static resource list
    }

    if (usedFallback && (upstreamStatus !== null || upstreamError)) {
      await logAdminActivity({
        scope: "kobo",
        event: "kobo.initialization_fallback_used",
        level: "WARN",
        message: "Kobo initialization fell back to bundled resources",
        actorUserId: auth.userId,
        details: {
          upstreamStatus,
          error: upstreamError
        }
      });
    }

    resources = {
      ...resources,
      affiliaterequest: `${baseUrl}/api/kobo/${params.token}/v1/affiliate`,
      assets: `${baseUrl}/api/kobo/${params.token}/v1/assets`,
      deals: `${baseUrl}/api/kobo/${params.token}/v1/deals`,
      device_auth: `${baseUrl}/api/kobo/${params.token}/v1/auth/device`,
      device_refresh: `${baseUrl}/api/kobo/${params.token}/v1/auth/refresh`,
      get_download_keys: `${baseUrl}/api/kobo/${params.token}/v1/library/downloadkeys`,
      get_download_link: `${baseUrl}/api/kobo/${params.token}/v1/library/downloadlink`,
      get_tests_request: `${baseUrl}/api/kobo/${params.token}/v1/analytics/gettests`,
      image_host: baseUrl,
      image_url_template: `${localImageBase}/thumbnail/{Width}/{Height}/false/image.jpg`,
      image_url_quality_template:
        `${localImageBase}/thumbnail/{Width}/{Height}/{Quality}/{IsGreyscale}/image.jpg`,
      library_book: `${baseUrl}/api/kobo/${params.token}/v1/user/library/books/{LibraryItemId}`,
      library_items: `${baseUrl}/api/kobo/${params.token}/v1/user/library`,
      library_metadata: `${baseUrl}/api/kobo/${params.token}/v1/library/{Ids}/metadata`,
      library_sync: `${baseUrl}/api/kobo/${params.token}/v1/library/sync`,
      post_analytics_event: `${baseUrl}/api/kobo/${params.token}/v1/analytics/event`,
      reading_state: `${baseUrl}/api/kobo/${params.token}/v1/library/{Ids}/state`,
      user_loyalty_benefits: `${baseUrl}/api/kobo/${params.token}/v1/user/loyalty/benefits`,
      user_profile: `${baseUrl}/api/kobo/${params.token}/v1/user/profile`,
      user_recommendations: `${baseUrl}/api/kobo/${params.token}/v1/user/recommendations`,
      user_wishlist: `${baseUrl}/api/kobo/${params.token}/v1/user/wishlist`
    };

    reply.header("x-kobo-apitoken", "e30=");
    fastify.log.info(
      {
        userId: auth.userId,
        usedFallback,
        upstreamStatus,
        resourceCount: Object.keys(resources).length
      },
      "kobo initialization resources built"
    );
    return {
      Resources: resources,
      UserId: String(auth.userId)
    };
  });

  fastify.post("/api/kobo/:token/v1/auth/device", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const body = (request.body ?? {}) as { UserKey?: string };
    return {
      AccessToken: crypto.randomUUID(),
      RefreshToken: crypto.randomUUID(),
      UserKey: body.UserKey ?? "booklite",
      TrackingId: crypto.randomUUID()
    };
  });

  fastify.post("/api/kobo/:token/v1/auth/refresh", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const body = (request.body ?? {}) as {
      UserKey?: string;
      RefreshToken?: string;
      refresh_token?: string;
    };

    return {
      AccessToken: crypto.randomUUID(),
      RefreshToken: body.RefreshToken ?? body.refresh_token ?? crypto.randomUUID(),
      UserKey: body.UserKey ?? "booklite",
      TrackingId: crypto.randomUUID()
    };
  });

  fastify.get("/api/kobo/:token/v1/affiliate", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    return {};
  });

  fastify.get("/api/kobo/:token/v1/user/profile", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });
    return {
      UserId: String(auth.userId),
      UserKey: "booklite",
      IsMaster: true,
      HasPassword: true
    };
  });

  fastify.get("/api/kobo/:token/v1/user/loyalty/benefits", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });
    return { Benefits: [] };
  });

  fastify.get("/api/kobo/:token/v1/deals", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });
    return {
      DailyDeal: null,
      FeaturedDeals: []
    };
  });

  fastify.get("/api/kobo/:token/v1/assets", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const hasDiffRequests =
      typeof (request.query as Record<string, unknown> | undefined)?.DiffRequests === "string";
    if (hasDiffRequests) {
      return reply.code(304).send();
    }
    return [];
  });

  fastify.post("/api/kobo/:token/v1/analytics/gettests", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });
    return {
      Result: "Success",
      TestKey: crypto.randomBytes(12).toString("hex")
    };
  });

  fastify.get("/api/kobo/:token/v1/user/library", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });
    return {
      PageIndex: 0,
      PageSize: 0,
      TotalResults: 0,
      Items: []
    };
  });

  fastify.get("/api/kobo/:token/v1/user/library/books/:libraryItemId", async (request, reply) => {
    const params = z
      .object({ token: z.string().min(6), libraryItemId: z.string().min(1) })
      .parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    if (!/^\d+$/.test(params.libraryItemId)) {
      return reply.code(404).send({ error: "Book not found" });
    }

    const bookId = Number.parseInt(params.libraryItemId, 10);
    const metadata = await getBookMetadataForKobo(
      auth.userId,
      bookId,
      params.token,
      process.env.BASE_URL ?? "http://localhost:6060"
    );
    if (!metadata) return reply.code(404).send({ error: "Book not found" });

    const now = new Date().toISOString();
    const readingState =
      (await getKoboReadingState(auth.userId, bookId)) ?? {
        EntitlementId: String(bookId),
        Created: now,
        LastModified: now,
        PriorityTimestamp: now,
        StatusInfo: {
          LastModified: now,
          Status: "ReadyToRead",
          TimesStartedReading: 0
        },
        CurrentBookmark: {
          ProgressPercent: 0,
          LastModified: now,
          Location: { Value: "", Type: "Unknown", Source: "booklite" }
        },
        Statistics: { LastModified: now }
      };

    return {
      BookEntitlement: {
        ActivePeriod: { From: now },
        Status: "Active",
        Accessibility: "Full",
        Id: String(bookId),
        EntitlementId: String(bookId),
        CrossRevisionId: String(bookId),
        RevisionId: String(bookId),
        ProductId: String(bookId),
        Created: now,
        LastModified: now,
        DateModified: now,
        IsHiddenFromArchive: false,
        IsLocked: false,
        OriginCategory: "Imported",
        IsRemoved: false,
        IsDeleted: false
      },
      BookMetadata: metadata,
      ReadingState: readingState
    };
  });

  fastify.post("/api/kobo/:token/v1/library/downloadlink", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const body = (request.body ?? {}) as Record<string, unknown>;
    const rawIds =
      (Array.isArray(body.RevisionIds) && body.RevisionIds) ||
      (Array.isArray(body.revisionIds) && body.revisionIds) ||
      (Array.isArray(body.EntitlementIds) && body.EntitlementIds) ||
      (Array.isArray(body.entitlementIds) && body.entitlementIds) ||
      [];

    const ids = rawIds
      .map((value) => Number.parseInt(String(value), 10))
      .filter((id) => Number.isFinite(id));

    const baseUrl = process.env.BASE_URL ?? "http://localhost:6060";
    const links = ids.map((id) => ({
      RevisionId: String(id),
      EntitlementId: String(id),
      Url: `${baseUrl}/api/kobo/${params.token}/v1/books/${id}/download`,
      DrmType: "None",
      Format: "EPUB3",
      Platform: "Generic"
    }));

    return {
      RequestResult: "Success",
      DownloadUrls: links
    };
  });

  fastify.post("/api/kobo/:token/v1/library/downloadkeys", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });
    return {
      RequestResult: "Success",
      Keys: []
    };
  });

  fastify.get("/api/kobo/:token/v1/library/sync", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const query = z
      .object({
        Filter: z.string().optional(),
        DownloadUrlFilter: z.string().optional(),
        PrioritizeRecentReads: z.union([z.string(), z.boolean()]).optional()
      })
      .passthrough()
      .parse(request.query);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const baselineSnapshotId = parseSyncTokenHeader(
      request.headers[koboHeaders.syncToken] as string | string[] | undefined
    );
    // Kobo typically uses Filter=ALL for normal incremental sync calls.
    // Only force a full entitlement sync when no valid sync token is present.
    const forceFullSync = baselineSnapshotId === null;

    let payload;
    let snapshotId;
    try {
      const result = await getLibrarySyncPayload(
        auth.userId,
        params.token,
        process.env.BASE_URL ?? "http://localhost:6060",
        {
          baselineSnapshotId: baselineSnapshotId ?? undefined,
          forceFullSync
        }
      );
      payload = result.payload;
      snapshotId = result.snapshotId;
    } catch (error) {
      await logAdminActivity({
        scope: "kobo",
        event: "kobo.library_sync_failed",
        message: "Kobo library sync payload generation failed",
        actorUserId: auth.userId,
        details: {
          forceFullSync,
          baselineSnapshotId,
          query,
          error
        }
      });
      return reply.code(500).send({ error: "Kobo sync failed" });
    }

    const payloadCounts = payload.reduce<Record<string, number>>((acc, entry) => {
      const key = Object.keys(entry)[0] ?? "Unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    fastify.log.info(
      {
        userId: auth.userId,
        forceFullSync,
        hasIncomingSyncToken: baselineSnapshotId !== null,
        payloadTotal: payload.length,
        payloadCounts
      },
      "kobo library sync payload built"
    );

    reply.header(koboHeaders.sync, "");
    reply.header(koboHeaders.syncToken, buildSyncTokenHeader(snapshotId));
    return payload;
  });

  fastify.get("/api/kobo/:token/v1/user/wishlist", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });
    return {
      PageIndex: 0,
      PageSize: 0,
      TotalResults: 0,
      Items: []
    };
  });

  fastify.get("/api/kobo/:token/v1/user/recommendations", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });
    return {
      TotalResults: 0,
      PageIndex: 0,
      PageSize: 0,
      Items: []
    };
  });

  fastify.get("/api/kobo/:token/v1/library/:bookId/metadata", async (request, reply) => {
    const params = z
      .object({ token: z.string().min(6), bookId: z.string().min(1) })
      .parse(request.params);

    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const requestedIds = params.bookId
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value))
      .map((value) => Number.parseInt(value, 10));
    if (requestedIds.length === 0) return reply.code(404).send({ error: "Invalid book id" });

    const results: Record<string, unknown>[] = [];
    for (const id of requestedIds) {
      const metadata = await getBookMetadataForKobo(
        auth.userId,
        id,
        params.token,
        process.env.BASE_URL ?? "http://localhost:6060"
      );
      if (metadata) results.push(metadata);
    }
    return results;
  });

  fastify.get("/api/kobo/:token/v1/library/:bookId/state", async (request, reply) => {
    const params = z
      .object({ token: z.string().min(6), bookId: z.string().min(1) })
      .parse(request.params);

    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const requestedIds = params.bookId
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value))
      .map((value) => Number.parseInt(value, 10));
    if (requestedIds.length === 0) return reply.code(404).send({ error: "Invalid book id" });

    const states: Record<string, unknown>[] = [];
    for (const id of requestedIds) {
      const state = await getKoboReadingState(auth.userId, id);
      if (state) states.push(state);
    }
    return states;
  });

  fastify.put("/api/kobo/:token/v1/library/:bookId/state", async (request, reply) => {
    const params = z
      .object({ token: z.string().min(6), bookId: z.string().min(1) })
      .parse(request.params);

    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const body = (request.body ?? {}) as {
      ReadingStates?: Array<Record<string, unknown>>;
      readingStates?: Array<Record<string, unknown>>;
    };

    const readingStates =
      body.ReadingStates ?? body.readingStates ?? [];

    try {
      await upsertKoboReadingStates(auth.userId, readingStates as Array<Record<string, any>>);
    } catch (error) {
      await logAdminActivity({
        scope: "kobo",
        event: "kobo.reading_state_upsert_failed",
        message: "Kobo reading state update failed",
        actorUserId: auth.userId,
        details: {
          count: readingStates.length,
          error
        }
      });
      return reply.code(500).send({ error: "Kobo reading state update failed" });
    }

    return {
      RequestResult: "Success",
      UpdateResults: readingStates.map((state) => ({
        EntitlementId: String((state as any).EntitlementId ?? (state as any).entitlementId ?? ""),
        CurrentBookmarkResult: { Result: "Success" },
        StatisticsResult: { Result: "Success" },
        StatusInfoResult: { Result: "Success" }
      }))
    };
  });

  fastify.delete("/api/kobo/:token/v1/library/:bookId", async (request, reply) => {
    const params = z
      .object({ token: z.string().min(6), bookId: z.string().min(1) })
      .parse(request.params);

    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const bookId = Number.parseInt(params.bookId, 10);
    if (!Number.isFinite(bookId) || bookId <= 0) {
      return reply.code(400).send({ error: "Invalid book id" });
    }

    if (await isBookInKoboSyncScope(auth.userId, bookId)) {
      await queueKoboBookRedelivery(auth.userId, bookId);
    }

    return {};
  });

  fastify.get("/api/kobo/:token/v1/books/:bookId/download", async (request, reply) => {
    const params = z
      .object({ token: z.string().min(6), bookId: z.coerce.number().int().positive() })
      .parse(request.params);

    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const row = await db
      .select({ filePath: books.filePath, title: books.title, fileExt: books.fileExt })
      .from(books)
      .where(eq(books.id, params.bookId))
      .limit(1);

    if (!row[0]) return reply.code(404).send({ error: "Book not found" });
    if (!(await isBookInKoboSyncScope(auth.userId, params.bookId))) {
      return reply.code(404).send({ error: "Book not found" });
    }

    const absolute = path.join(config.booksDir, row[0].filePath);
    if (!fs.existsSync(absolute)) {
      await logAdminActivity({
        scope: "kobo",
        event: "kobo.download_file_missing",
        level: "WARN",
        message: "Kobo download target file is missing",
        actorUserId: auth.userId,
        bookId: params.bookId,
        details: {
          absolute,
          filePath: row[0].filePath
        }
      });
      return reply.code(404).send({ error: "File not found" });
    }

    const stats = fs.statSync(absolute);
    const contentType =
      (lookupMime(row[0].fileExt) as string | false) || "application/octet-stream";

    fastify.log.info(
      {
        userId: auth.userId,
        bookId: params.bookId,
        absolute,
        bytes: stats.size
      },
      "kobo download requested"
    );

    reply.header(
      "content-disposition",
      `attachment; filename=\"${row[0].title}.${row[0].fileExt}\"`
    );
    reply.header("content-type", contentType);
    reply.header("content-length", String(stats.size));
    reply.header("accept-ranges", "bytes");
    return reply.send(fs.createReadStream(absolute));
  });

  fastify.get(
    "/api/kobo/:token/v1/books/:imageId/thumbnail/:width/:height/false/image.jpg",
    async (request, reply) => {
      const params = z
        .object({ token: z.string(), imageId: z.string() })
        .parse(request.params);
      const auth = await koboAuth(params.token);
      if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });
      return respondCover(auth.userId, params.imageId, reply);
    }
  );

  fastify.get(
    "/api/kobo/:token/v1/books/:imageId/:version/thumbnail/:width/:height/false/image.jpg",
    async (request, reply) => {
      const params = z
        .object({ token: z.string(), imageId: z.string() })
        .parse(request.params);
      const auth = await koboAuth(params.token);
      if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });
      return respondCover(auth.userId, params.imageId, reply);
    }
  );

  fastify.get(
    "/api/kobo/:token/v1/books/:imageId/thumbnail/:width/:height/:quality/:isGreyscale/image.jpg",
    async (request, reply) => {
      const params = z
        .object({ token: z.string(), imageId: z.string() })
        .parse(request.params);
      const auth = await koboAuth(params.token);
      if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });
      return respondCover(auth.userId, params.imageId, reply);
    }
  );

  fastify.get(
    "/api/kobo/:token/v1/books/:imageId/:version/thumbnail/:width/:height/:quality/:isGreyscale/image.jpg",
    async (request, reply) => {
      const params = z
        .object({ token: z.string(), imageId: z.string() })
        .parse(request.params);
      const auth = await koboAuth(params.token);
      if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });
      return respondCover(auth.userId, params.imageId, reply);
    }
  );

  fastify.post("/api/kobo/:token/v1/analytics/event", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });
    return {};
  });

  fastify.all("/api/kobo/:token/*", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const requestUrl = request.raw.url ?? "";
    const stripped = requestUrl.replace(/^\/api\/kobo\/[^/]+/, "");

    if (/^\/v1\/products\/\d+\/nextread(?:\?|$)/i.test(stripped)) {
      return {};
    }

    if (/^\/v1\/analytics\/event(?:\?|$)/i.test(stripped)) {
      return {};
    }

    const upstreamUrl = `https://storeapi.kobo.com${stripped}`;

    const headers: Record<string, string> = {
      "user-agent": request.headers["user-agent"] ?? "BookLite/1.0",
      accept: request.headers.accept ?? "application/json"
    };

    if (typeof request.headers.authorization === "string") {
      headers.authorization = request.headers.authorization;
    }

    if (typeof request.headers["accept-language"] === "string") {
      headers["accept-language"] = request.headers["accept-language"];
    }

    for (const [key, value] of Object.entries(request.headers)) {
      if (key.toLowerCase().startsWith("x-kobo-") && typeof value === "string") {
        headers[key] = value;
      }
    }

    let response: Response;
    try {
      response = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : JSON.stringify(request.body ?? {})
      });
    } catch (error) {
      await logAdminActivity({
        scope: "kobo",
        event: "kobo.passthrough_failed",
        message: "Kobo passthrough request failed before a response was received",
        actorUserId: auth.userId,
        details: {
          method: request.method,
          strippedPath: stripped,
          error
        }
      });
      return reply.code(502).send({ error: "Kobo upstream request failed" });
    }

    const body = await response.text();
    if (response.status >= 500) {
      await logAdminActivity({
        scope: "kobo",
        event: "kobo.passthrough_upstream_error",
        level: "WARN",
        message: "Kobo passthrough request returned an upstream server error",
        actorUserId: auth.userId,
        details: {
          method: request.method,
          strippedPath: stripped,
          upstreamStatus: response.status
        }
      });
    }
    fastify.log.info(
      {
        userId: auth.userId,
        method: request.method,
        strippedPath: stripped,
        upstreamStatus: response.status
      },
      "kobo passthrough request"
    );

    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase().startsWith("x-kobo-")) {
        reply.header(key, value);
      }
    }

    reply.code(response.status);
    reply.header("content-type", response.headers.get("content-type") ?? "application/json");

    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  });
};
