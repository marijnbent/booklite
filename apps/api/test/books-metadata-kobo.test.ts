import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempEnv } from "./helpers";

const { fetchMetadataWithFallbackMock } = vi.hoisted(() => ({
  fetchMetadataWithFallbackMock: vi.fn()
}));

vi.mock("../src/services/metadata", () => ({
  fetchMetadataWithFallback: fetchMetadataWithFallbackMock
}));

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let accessToken = "";
let syncedBookId = 0;
let unsyncedBookId = 0;
let fallbackBookId = 0;

describe("books metadata + kobo scope", () => {
  beforeAll(async () => {
    const appModule = await import("../src/app");
    app = appModule.buildApp();
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/api/v1/setup",
      payload: {
        email: "owner5@example.com",
        username: "owner5",
        password: "secret123"
      }
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        usernameOrEmail: "owner5",
        password: "secret123"
      }
    });
    accessToken = login.json().accessToken;

    const dbModule = await import("../src/db/client");
    const schema = await import("../src/db/schema");

    const now = new Date().toISOString();
    const inserted = await dbModule.db
      .insert(schema.books)
      .values([
        {
          ownerUserId: 1,
          title: "Synced Target",
          author: "Local Author",
          series: null,
          description: null,
          coverPath: null,
          filePath: "synced-target.epub",
          fileExt: "epub",
          fileSize: 1234,
          koboSyncable: 1,
          createdAt: now,
          updatedAt: now
        },
        {
          ownerUserId: 1,
          title: "Unsynced Target",
          author: "Local Author",
          series: null,
          description: null,
          coverPath: null,
          filePath: "unsynced-target.epub",
          fileExt: "epub",
          fileSize: 1234,
          koboSyncable: 1,
          createdAt: now,
          updatedAt: now
        },
        {
          ownerUserId: 1,
          title: "Placeholder",
          author: null,
          series: null,
          description: null,
          coverPath: null,
          filePath: "[Jane Doe] Fallback From File.pdf",
          fileExt: "pdf",
          fileSize: 1000,
          koboSyncable: 0,
          createdAt: now,
          updatedAt: now
        }
      ])
      .returning({ id: schema.books.id, title: schema.books.title });

    syncedBookId = inserted.find((row) => row.title === "Synced Target")!.id;
    unsyncedBookId = inserted.find((row) => row.title === "Unsynced Target")!.id;
    fallbackBookId = inserted.find((row) => row.title === "Placeholder")!.id;

    const createdCollection = await app.inject({
      method: "POST",
      url: "/api/v1/collections",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Kobo Sync List", icon: null }
    });
    const collectionId = createdCollection.json().id;

    await app.inject({
      method: "PUT",
      url: `/api/v1/books/${syncedBookId}/collections`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { collectionIds: [collectionId] }
    });

    await app.inject({
      method: "PUT",
      url: "/api/v1/kobo/settings",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        syncEnabled: true,
        twoWayProgressSync: true,
        markReadingThreshold: 1,
        markFinishedThreshold: 99,
        syncCollectionIds: [collectionId]
      }
    });
  });

  beforeEach(() => {
    fetchMetadataWithFallbackMock.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it("only marks books in selected Kobo sync collections as koboSyncable", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/books",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(listRes.statusCode).toBe(200);
    const books = listRes.json() as Array<{ id: number; koboSyncable: number }>;
    const byId = new Map(books.map((book) => [book.id, book]));

    expect(byId.get(syncedBookId)?.koboSyncable).toBe(1);
    expect(byId.get(unsyncedBookId)?.koboSyncable).toBe(0);
    expect(byId.get(fallbackBookId)?.koboSyncable).toBe(0);

    const syncedDetail = await app.inject({
      method: "GET",
      url: `/api/v1/books/${syncedBookId}`,
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(syncedDetail.statusCode).toBe(200);
    expect(syncedDetail.json().koboSyncable).toBe(1);

    const unsyncedDetail = await app.inject({
      method: "GET",
      url: `/api/v1/books/${unsyncedBookId}`,
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(unsyncedDetail.statusCode).toBe(200);
    expect(unsyncedDetail.json().koboSyncable).toBe(0);
  });

  it("can refresh metadata for all books and reports a summary", async () => {
    fetchMetadataWithFallbackMock.mockImplementation(async (title: string) => {
      if (title === "Synced Target") {
        return {
          source: "OPEN_LIBRARY",
          title: "Synced Updated",
          author: "Remote Author",
          description: "Remote description",
          coverPath: "https://example.test/covers/synced.jpg"
        };
      }

      if (title === "Unsynced Target") {
        throw new Error("metadata provider error");
      }

      return { source: "NONE" };
    });

    const refreshRes = await app.inject({
      method: "POST",
      url: "/api/v1/books/metadata/fetch-all",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(refreshRes.statusCode).toBe(200);
    expect(refreshRes.json()).toMatchObject({
      ok: true,
      total: 3,
      refreshed: 2,
      updated: 2,
      matched: 1,
      fallback: 1,
      failed: 1
    });

    const syncedDetail = await app.inject({
      method: "GET",
      url: `/api/v1/books/${syncedBookId}`,
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(syncedDetail.statusCode).toBe(200);
    expect(syncedDetail.json()).toMatchObject({
      title: "Synced Updated",
      author: "Remote Author",
      description: "Remote description",
      coverPath: "https://example.test/covers/synced.jpg"
    });

    const fallbackDetail = await app.inject({
      method: "GET",
      url: `/api/v1/books/${fallbackBookId}`,
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(fallbackDetail.statusCode).toBe(200);
    expect(fallbackDetail.json()).toMatchObject({
      title: "Fallback From File",
      author: "Jane Doe"
    });
  });
});
