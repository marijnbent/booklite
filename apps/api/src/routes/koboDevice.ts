import fs from "node:fs";
import path from "node:path";
import { FastifyPluginAsync } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { books, koboUserSettings } from "../db/schema";
import {
  buildSyncTokenHeader,
  getBookMetadataForKobo,
  getKoboReadingState,
  getKoboUserByToken,
  getLibrarySyncPayload,
  koboHeaders,
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
  token: string,
  imageId: string,
  reply: any
): Promise<any> => {
  const bookId = resolveBookIdFromImageId(imageId);
  if (!bookId) return reply.code(404).send({ error: "Image not found" });

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

export const koboDeviceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/kobo/:token/v1/initialization", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    return {
      Resources: {
        LibrarySync: `${process.env.BASE_URL ?? "http://localhost:6060"}/api/kobo/${params.token}/v1/library/sync`,
        DeviceAuth: `${process.env.BASE_URL ?? "http://localhost:6060"}/api/kobo/${params.token}/v1/auth/device`
      },
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

  fastify.get("/api/kobo/:token/v1/library/sync", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const { payload, snapshotId } = await getLibrarySyncPayload(
      auth.userId,
      params.token,
      process.env.BASE_URL ?? "http://localhost:6060"
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

  fastify.get("/api/kobo/:token/v1/books/:bookId/download", async (request, reply) => {
    const params = z
      .object({ token: z.string().min(6), bookId: z.coerce.number().int().positive() })
      .parse(request.params);

    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const row = await db
      .select({ filePath: books.filePath, title: books.title, fileExt: books.fileExt })
      .from(books)
      .where(and(eq(books.id, params.bookId), eq(books.koboSyncable, 1)))
      .limit(1);

    if (!row[0]) return reply.code(404).send({ error: "Book not found" });

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
      return respondCover(params.token, params.imageId, reply);
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
      return respondCover(params.token, params.imageId, reply);
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
      return respondCover(params.token, params.imageId, reply);
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
      return respondCover(params.token, params.imageId, reply);
    }
  );

  fastify.all("/api/kobo/:token/*", async (request, reply) => {
    const params = z.object({ token: z.string().min(6) }).parse(request.params);
    const auth = await koboAuth(params.token);
    if (!auth) return reply.code(401).send({ error: "Invalid Kobo token" });

    const requestUrl = request.raw.url ?? "";
    const stripped = requestUrl.replace(/^\/api\/kobo\/[^/]+/, "");
    const upstreamUrl = `https://storeapi.kobo.com${stripped}`;

    const headers: Record<string, string> = {
      "user-agent": request.headers["user-agent"] ?? "BookLite/1.0",
      accept: request.headers.accept ?? "application/json"
    };

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

import crypto from "node:crypto";
