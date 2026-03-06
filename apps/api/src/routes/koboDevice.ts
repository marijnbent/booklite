import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { books } from "../db/schema";
import {
  buildSyncTokenHeader,
  getBookMetadataForKobo,
  getKoboReadingState,
  getKoboUserByToken,
  getLibrarySyncPayload,
  isBookInKoboSyncScope,
  koboHeaders,
  parseSyncTokenHeader,
  resolveBookIdFromImageId,
  upsertKoboReadingStates
} from "../services/kobo";

const koboAuth = async (token: string) => {
  const user = await getKoboUserByToken(token);
  if (!user || !user.syncEnabled) {
    return null;
  }
  return user;
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
    return reply.code(404).send({ error: "No cover" });
  }

  if (coverPath.startsWith("http://") || coverPath.startsWith("https://")) {
    const response = await fetch(coverPath);
    if (!response.ok) return reply.code(404).send({ error: "Cover fetch failed" });

    reply.header("content-type", response.headers.get("content-type") ?? "image/jpeg");
    return reply.send(Buffer.from(await response.arrayBuffer()));
  }

  const absolutePath = path.isAbsolute(coverPath)
    ? coverPath
    : path.join(process.env.BOOKS_DIR ?? "/books", coverPath);

  if (!fs.existsSync(absolutePath)) {
    return reply.code(404).send({ error: "Cover not found" });
  }

  reply.header("content-type", "image/jpeg");
  return reply.send(fs.createReadStream(absolutePath));
};

const defaultStoreResources = {
  affiliaterequest: "https://storeapi.kobo.com/v1/affiliate",
  deals: "https://storeapi.kobo.com/v1/deals",
  device_auth: "https://storeapi.kobo.com/v1/auth/device",
  device_refresh: "https://storeapi.kobo.com/v1/auth/refresh",
  get_tests_request: "https://storeapi.kobo.com/v1/analytics/gettests",
  image_host: "https://cdn.kobo.com/book-images/",
  image_url_template:
    "https://cdn.kobo.com/book-images/{ImageId}/{Width}/{Height}/false/image.jpg",
  image_url_quality_template:
    "https://cdn.kobo.com/book-images/{ImageId}/{Width}/{Height}/{Quality}/{IsGreyscale}/image.jpg",
  library_metadata: "https://storeapi.kobo.com/v1/library/{Ids}/metadata",
  library_sync: "https://storeapi.kobo.com/v1/library/sync",
  post_analytics_event: "https://storeapi.kobo.com/v1/analytics/event",
  user_loyalty_benefits: "https://storeapi.kobo.com/v1/user/loyalty/benefits",
  user_profile: "https://storeapi.kobo.com/v1/user/profile",
  user_recommendations: "https://storeapi.kobo.com/v1/user/recommendations",
  user_wishlist: "https://storeapi.kobo.com/v1/user/wishlist"
} as const;

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

    let resources: Record<string, unknown> = { ...defaultStoreResources };
    try {
      const upstream = await fetch("https://storeapi.kobo.com/v1/initialization", {
        headers: {
          "user-agent": request.headers["user-agent"] ?? "BookLite/1.0",
          accept: request.headers.accept ?? "application/json"
        }
      });
      if (upstream.ok) {
        const body = (await upstream.json()) as { Resources?: Record<string, unknown> };
        if (body?.Resources && typeof body.Resources === "object") {
          resources = body.Resources;
        }
      }
    } catch {
      // fall back to static resource list
    }

    resources = {
      ...resources,
      device_auth: `${baseUrl}/api/kobo/${params.token}/v1/auth/device`,
      device_refresh: `${baseUrl}/api/kobo/${params.token}/v1/auth/refresh`,
      image_host: baseUrl,
      image_url_template: `${localImageBase}/thumbnail/{Width}/{Height}/false/image.jpg`,
      image_url_quality_template:
        `${localImageBase}/thumbnail/{Width}/{Height}/{Quality}/{IsGreyscale}/image.jpg`,
      library_sync: `${baseUrl}/api/kobo/${params.token}/v1/library/sync`,
      library_metadata: `${baseUrl}/api/kobo/${params.token}/v1/library/{Ids}/metadata`,
      reading_state: `${baseUrl}/api/kobo/${params.token}/v1/library/{Ids}/state`
    };

    reply.header("x-kobo-apitoken", "e30=");
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

  fastify.get("/api/kobo/:token/v1/library/sync", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const baselineSnapshotId = parseSyncTokenHeader(
      request.headers[koboHeaders.syncToken] as string | string[] | undefined
    );
    const forceFullSync = baselineSnapshotId === null;

    const { payload, snapshotId } = await getLibrarySyncPayload(
      auth.userId,
      params.token,
      process.env.BASE_URL ?? "http://localhost:6060",
      {
        baselineSnapshotId: baselineSnapshotId ?? undefined,
        forceFullSync
      }
    );

    const payloadCounts = payload.reduce<Record<string, number>>((acc, entry) => {
      const key = Object.keys(entry)[0] ?? "Unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    fastify.log.info(
      {
        userId: auth.userId,
        payloadTotal: payload.length,
        payloadCounts
      },
      "kobo library sync payload built"
    );

    reply.header(koboHeaders.sync, "");
    reply.header(koboHeaders.syncToken, buildSyncTokenHeader(snapshotId));
    return payload;
  });

  fastify.get("/api/kobo/:token/v1/library/:bookId/metadata", async (request, reply) => {
    const params = z
      .object({ token: z.string().min(6), bookId: z.string().min(1) })
      .parse(request.params);

    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const bookId = Number.parseInt(params.bookId, 10);
    if (!Number.isFinite(bookId)) return reply.code(404).send({ error: "Invalid book id" });

    const metadata = await getBookMetadataForKobo(
      auth.userId,
      bookId,
      params.token,
      process.env.BASE_URL ?? "http://localhost:6060"
    );

    if (!metadata) return reply.code(404).send({ error: "Book not found" });
    return [metadata];
  });

  fastify.get("/api/kobo/:token/v1/library/:bookId/state", async (request, reply) => {
    const params = z
      .object({ token: z.string().min(6), bookId: z.string().min(1) })
      .parse(request.params);

    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const bookId = Number.parseInt(params.bookId, 10);
    if (!Number.isFinite(bookId)) return reply.code(404).send({ error: "Invalid book id" });

    const state = await getKoboReadingState(auth.userId, bookId);
    if (!state) return [];

    return [state];
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

    await upsertKoboReadingStates(auth.userId, readingStates as Array<Record<string, any>>);

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

    if (Number.isFinite(Number.parseInt(params.bookId, 10))) {
      return {};
    }

    return reply.code(400).send({ error: "Invalid book id" });
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

    const absolute = path.join(process.env.BOOKS_DIR ?? "/books", row[0].filePath);
    if (!fs.existsSync(absolute)) return reply.code(404).send({ error: "File not found" });

    reply.header(
      "content-disposition",
      `attachment; filename=\"${row[0].title}.${row[0].fileExt}\"`
    );
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

    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : JSON.stringify(request.body ?? {})
    });

    const body = await response.text();

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
