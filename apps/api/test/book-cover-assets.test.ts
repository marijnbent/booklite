import fs from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";

createTempEnv();

vi.mock("../src/services/metadata", () => ({
  fetchMetadataWithFallback: vi.fn(async () => ({ source: "NONE" }))
}));

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=",
  "base64"
);

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let accessToken = "";
let ownerUserId = 0;
let appDataDir = "";
let dbModule: typeof import("../src/db/client");
let schemaModule: typeof import("../src/db/schema");
let metadataModule: typeof import("../src/services/metadata");

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

const createBook = async () => {
  const timestamp = "2026-03-08T12:00:00.000Z";
  const [book] = await dbModule.db
    .insert(schemaModule.books)
    .values({
      ownerUserId,
      title: "Localized Cover Test",
      author: "BookLite",
      series: null,
      description: null,
      coverPath: null,
      filePath: `localized-cover-${Date.now()}.epub`,
      fileExt: "epub",
      fileSize: 1024,
      koboSyncable: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .returning({ id: schemaModule.books.id });

  return book.id;
};

const patchCover = async (bookId: number, coverPath: string | null) =>
  app.inject({
    method: "PATCH",
    url: `/api/v1/books/${bookId}`,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    payload: { coverPath }
  });

describe("localized cover assets", () => {
  beforeAll(async () => {
    app = await setupTestApp();
    accessToken = (await setupOwnerAndLogin(app)).accessToken;

    dbModule = await import("../src/db/client");
    schemaModule = await import("../src/db/schema");
    metadataModule = await import("../src/services/metadata");
    appDataDir = process.env.APP_DATA_DIR ?? "";

    const [owner] = await dbModule.db
      .select({ id: schemaModule.users.id })
      .from(schemaModule.users)
      .where(eq(schemaModule.users.username, "owner"))
      .limit(1);

    ownerUserId = owner.id;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(metadataModule.fetchMetadataWithFallback).mockResolvedValue({ source: "NONE" });
  });

  it("localizes a picked remote cover and serves it through the app route", async () => {
    fetchMock.mockResolvedValue(
      new Response(tinyPng, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(tinyPng.length)
        }
      })
    );

    const bookId = await createBook();
    const response = await patchCover(bookId, "https://covers.example/cover.png");
    expect(response.statusCode).toBe(200);

    const [stored] = await dbModule.db
      .select({
        coverPath: schemaModule.books.coverPath,
        updatedAt: schemaModule.books.updatedAt
      })
      .from(schemaModule.books)
      .where(eq(schemaModule.books.id, bookId))
      .limit(1);

    expect(stored.coverPath).toBe(`managed://covers/${bookId}/cover.jpg`);

    const coverFile = path.join(appDataDir, "covers", String(bookId), "cover.jpg");
    expect(fs.existsSync(coverFile)).toBe(true);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookId}`,
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().coverPath).toBe(
      `/api/v1/books/${bookId}/cover?v=${encodeURIComponent(stored.updatedAt)}`
    );

    const unauthorizedCover = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookId}/cover?v=${encodeURIComponent(stored.updatedAt)}`
    });
    expect(unauthorizedCover.statusCode).toBe(401);

    const servedCover = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookId}/cover?token=${accessToken}&v=${encodeURIComponent(stored.updatedAt)}`
    });
    expect(servedCover.statusCode).toBe(200);
    expect(servedCover.headers["content-type"]).toContain("image/jpeg");
    expect(servedCover.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(servedCover.body.length).toBeGreaterThan(0);
  });

  it("clears a managed cover and removes the stored file", async () => {
    fetchMock.mockResolvedValue(
      new Response(tinyPng, {
        status: 200,
        headers: { "content-type": "image/png" }
      })
    );

    const bookId = await createBook();
    expect((await patchCover(bookId, "https://covers.example/remove-me.png")).statusCode).toBe(200);

    const coverFile = path.join(appDataDir, "covers", String(bookId), "cover.jpg");
    expect(fs.existsSync(coverFile)).toBe(true);

    const clearResponse = await patchCover(bookId, null);
    expect(clearResponse.statusCode).toBe(200);

    const [stored] = await dbModule.db
      .select({ coverPath: schemaModule.books.coverPath })
      .from(schemaModule.books)
      .where(eq(schemaModule.books.id, bookId))
      .limit(1);

    expect(stored.coverPath).toBeNull();
    expect(fs.existsSync(coverFile)).toBe(false);
  });

  it("localizes metadata refresh covers instead of storing raw remote URLs", async () => {
    vi.mocked(metadataModule.fetchMetadataWithFallback).mockResolvedValue({
      source: "GOOGLE",
      title: "Localized Cover Test",
      author: "BookLite",
      coverPath: "https://covers.example/from-metadata.png"
    });
    fetchMock.mockResolvedValue(
      new Response(tinyPng, {
        status: 200,
        headers: { "content-type": "image/png" }
      })
    );

    const bookId = await createBook();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/books/${bookId}/metadata/fetch`,
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, source: "GOOGLE", updated: true });

    const [stored] = await dbModule.db
      .select({ coverPath: schemaModule.books.coverPath })
      .from(schemaModule.books)
      .where(eq(schemaModule.books.id, bookId))
      .limit(1);

    expect(stored.coverPath).toBe(`managed://covers/${bookId}/cover.jpg`);
  });

  it("keeps the current cover when metadata cover localization fails", async () => {
    fetchMock.mockResolvedValue(
      new Response(tinyPng, {
        status: 200,
        headers: { "content-type": "image/png" }
      })
    );

    const bookId = await createBook();
    expect((await patchCover(bookId, "https://covers.example/original.png")).statusCode).toBe(200);

    vi.mocked(metadataModule.fetchMetadataWithFallback).mockResolvedValue({
      source: "OPEN_LIBRARY",
      title: "Localized Cover Test",
      author: "BookLite",
      coverPath: "https://covers.example/bad-cover.txt"
    });
    fetchMock.mockResolvedValue(
      new Response("not an image", {
        status: 200,
        headers: { "content-type": "text/plain" }
      })
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/books/${bookId}/metadata/fetch`,
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(response.statusCode).toBe(200);

    const [stored] = await dbModule.db
      .select({ coverPath: schemaModule.books.coverPath })
      .from(schemaModule.books)
      .where(eq(schemaModule.books.id, bookId))
      .limit(1);

    expect(stored.coverPath).toBe(`managed://covers/${bookId}/cover.jpg`);
  });
});
