import { beforeAll, describe, expect, it } from "vitest";
import fixture from "./fixtures/kobo/library-sync-response.json";
import { createTempEnv } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let accessToken = "";
let koboToken = "";
let favoritesCollectionId = 0;
let bookId = 0;

describe("kobo contract", () => {
  beforeAll(async () => {
    const appModule = await import("../src/app");
    app = appModule.buildApp();
    await app.ready();

    const dbModule = await import("../src/db/client");
    const schema = await import("../src/db/schema");

    await app.inject({
      method: "POST",
      url: "/api/v1/setup",
      payload: {
        email: "owner4@example.com",
        username: "owner4",
        password: "secret123"
      }
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        usernameOrEmail: "owner4",
        password: "secret123"
      }
    });

    accessToken = login.json().accessToken;

    const inserted = await dbModule.db.insert(schema.books).values({
      ownerUserId: 1,
      title: "Kobo Sample",
      author: "Author",
      series: null,
      description: null,
      coverPath: null,
      filePath: "kobo.epub",
      fileExt: "epub",
      fileSize: 100,
      koboSyncable: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).returning({ id: schema.books.id });

    bookId = inserted[0].id;

    const collectionsRes = await app.inject({
      method: "GET",
      url: "/api/v1/collections",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    favoritesCollectionId = collectionsRes.json().find((c: any) => c.slug === "favorites")?.id;

    await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookId}/favorite`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { favorite: true }
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
        syncCollectionIds: [favoritesCollectionId]
      }
    });

    const settings = await app.inject({
      method: "GET",
      url: "/api/v1/kobo/settings",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    koboToken = settings.json().token;
  });

  it("returns Kobo sync headers and entitlement-like payload", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/kobo/${koboToken}/v1/library/sync`
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-kobo-synctoken"]).toBeTruthy();
    expect(response.headers["x-kobo-sync"]).toBeDefined();

    const payload = response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(JSON.stringify(payload).includes("Entitlement")).toBe(true);
    expect(JSON.stringify(fixture).includes("NewEntitlement")).toBe(true);
  });

  it("returns full entitlements again when sync token header is missing", async () => {
    const first = await app.inject({
      method: "GET",
      url: `/api/kobo/${koboToken}/v1/library/sync`
    });

    expect(first.statusCode).toBe(200);
    expect(JSON.stringify(first.json()).includes("Entitlement")).toBe(true);

    const second = await app.inject({
      method: "GET",
      url: `/api/kobo/${koboToken}/v1/library/sync`
    });

    expect(second.statusCode).toBe(200);
    expect(JSON.stringify(second.json()).includes("Entitlement")).toBe(true);
  });

  it("supports local affiliate, refresh and analytics endpoints", async () => {
    const affiliate = await app.inject({
      method: "GET",
      url: `/api/kobo/${koboToken}/v1/affiliate?PlatformID=00000000-0000-0000-0000-000000000376&SerialNumber=test`
    });
    expect(affiliate.statusCode).toBe(200);

    const refresh = await app.inject({
      method: "POST",
      url: `/api/kobo/${koboToken}/v1/auth/refresh`,
      payload: {
        UserKey: "booklite",
        RefreshToken: "refresh-token"
      }
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json().AccessToken).toBeTruthy();

    const analytics = await app.inject({
      method: "POST",
      url: `/api/kobo/${koboToken}/v1/analytics/event`,
      payload: {}
    });
    expect(analytics.statusCode).toBe(200);
  });

  it("ignores unknown entitlement reading-state updates", async () => {
    const timestamp = new Date().toISOString();
    const response = await app.inject({
      method: "PUT",
      url: `/api/kobo/${koboToken}/v1/library/999999/state`,
      payload: {
        ReadingStates: [
          {
            EntitlementId: "999999",
            LastModified: timestamp,
            PriorityTimestamp: timestamp,
            StatusInfo: {
              LastModified: timestamp,
              Status: "Reading"
            },
            CurrentBookmark: {
              ProgressPercent: 14,
              LastModified: timestamp,
              Location: {
                Value: "chapter-1",
                Type: "Unknown",
                Source: "booklite"
              }
            }
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().RequestResult).toBe("Success");
  });

  it("accepts empty json body on kobo delete passthrough", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      })) as typeof fetch;

    try {
      const response = await app.inject({
        method: "DELETE",
        url: `/api/kobo/${koboToken}/v1/library/50`,
        headers: { "content-type": "application/json" }
      });

      expect(response.statusCode).toBe(200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
