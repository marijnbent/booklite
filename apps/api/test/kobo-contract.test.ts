import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fixture from "./fixtures/kobo/library-sync-response.json";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";

const { booksDir } = createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let accessToken = "";
let koboToken = "";
let favoritesCollectionId = 0;
let bookId = 0;
let unsyncedBookId = 0;
const koboBookBody = "dummy-epub-content";

const getEntriesByKey = (payload: unknown, key: string): Array<Record<string, unknown>> => {
  if (!Array.isArray(payload)) return [];
  return payload.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null && key in entry
  );
};

describe("kobo contract", () => {
  beforeAll(async () => {
    app = await setupTestApp();

    const dbModule = await import("../src/db/client");
    const schema = await import("../src/db/schema");

    accessToken = (await setupOwnerAndLogin(app, "owner4@example.com", "owner4")).accessToken;

    const timestamp = new Date().toISOString();
    fs.writeFileSync(path.join(booksDir, "kobo.epub"), koboBookBody);
    const inserted = await dbModule.db
      .insert(schema.books)
      .values([
        {
          ownerUserId: 1,
          title: "Kobo Café Sample",
          author: "Author",
          series: null,
          description: null,
          coverPath: null,
          filePath: "kobo.epub",
          fileExt: "epub",
          fileSize: 100,
          koboSyncable: 1,
          createdAt: timestamp,
          updatedAt: timestamp
        },
        {
          ownerUserId: 1,
          title: "Kobo Unsynced",
          author: "Author",
          series: null,
          description: null,
          coverPath: null,
          filePath: "kobo-unsynced.epub",
          fileExt: "epub",
          fileSize: 100,
          koboSyncable: 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ])
      .returning({ id: schema.books.id, title: schema.books.title });

    bookId = inserted.find((row) => row.title === "Kobo Café Sample")!.id;
    unsyncedBookId = inserted.find((row) => row.title === "Kobo Unsynced")!.id;

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
        syncAllBooks: false,
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

  afterAll(async () => {
    await app.close();
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

  it("re-delivers a deleted synced book on the next incremental sync only once", async () => {
    const first = await app.inject({
      method: "GET",
      url: `/api/kobo/${koboToken}/v1/library/sync`
    });

    expect(first.statusCode).toBe(200);
    const firstSyncToken = String(first.headers["x-kobo-synctoken"]);

    const second = await app.inject({
      method: "GET",
      url: `/api/kobo/${koboToken}/v1/library/sync`,
      headers: { "x-kobo-synctoken": firstSyncToken }
    });

    expect(second.statusCode).toBe(200);
    expect(getEntriesByKey(second.json(), "NewEntitlement")).toHaveLength(0);
    const secondSyncToken = String(second.headers["x-kobo-synctoken"]);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/kobo/${koboToken}/v1/library/${bookId}`,
      headers: { "content-type": "application/json" }
    });

    expect(deleteResponse.statusCode).toBe(200);

    const third = await app.inject({
      method: "GET",
      url: `/api/kobo/${koboToken}/v1/library/sync`,
      headers: { "x-kobo-synctoken": secondSyncToken }
    });

    expect(third.statusCode).toBe(200);
    const redelivered = getEntriesByKey(third.json(), "NewEntitlement");
    expect(redelivered).toHaveLength(1);
    expect(
      (redelivered[0].NewEntitlement as { BookEntitlement: { EntitlementId: string } }).BookEntitlement.EntitlementId
    ).toBe(String(bookId));

    const thirdSyncToken = String(third.headers["x-kobo-synctoken"]);
    const fourth = await app.inject({
      method: "GET",
      url: `/api/kobo/${koboToken}/v1/library/sync`,
      headers: { "x-kobo-synctoken": thirdSyncToken }
    });

    expect(fourth.statusCode).toBe(200);
    expect(getEntriesByKey(fourth.json(), "NewEntitlement")).toHaveLength(0);
  });

  it("ignores delete requests for books outside the sync scope", async () => {
    const first = await app.inject({
      method: "GET",
      url: `/api/kobo/${koboToken}/v1/library/sync`
    });
    const firstSyncToken = String(first.headers["x-kobo-synctoken"]);

    const incremental = await app.inject({
      method: "GET",
      url: `/api/kobo/${koboToken}/v1/library/sync`,
      headers: { "x-kobo-synctoken": firstSyncToken }
    });
    const incrementalSyncToken = String(incremental.headers["x-kobo-synctoken"]);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/kobo/${koboToken}/v1/library/${unsyncedBookId}`,
      headers: { "content-type": "application/json" }
    });

    expect(deleteResponse.statusCode).toBe(200);

    const afterDelete = await app.inject({
      method: "GET",
      url: `/api/kobo/${koboToken}/v1/library/sync`,
      headers: { "x-kobo-synctoken": incrementalSyncToken }
    });

    expect(afterDelete.statusCode).toBe(200);
    expect(getEntriesByKey(afterDelete.json(), "NewEntitlement")).toHaveLength(0);
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
    expect(refresh.json().TokenType).toBe("Bearer");

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

  it("downloads Kobo books with booklore-style attachment headers", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/kobo/${koboToken}/v1/books/${bookId}/download`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(koboBookBody);
    expect(response.headers["content-type"]).toBe("application/octet-stream");
    expect(response.headers["content-length"]).toBe(String(Buffer.byteLength(koboBookBody)));
    expect(response.headers["accept-ranges"]).toBeUndefined();
    expect(response.headers["content-disposition"]).toContain(
      `filename="Kobo Caf_ Sample.epub"`
    );
    expect(response.headers["content-disposition"]).toContain(
      "filename*=UTF-8''Kobo%20Caf%C3%A9%20Sample.epub"
    );
  });

  it("supports HEAD probes for Kobo book downloads without a response body", async () => {
    const response = await app.inject({
      method: "HEAD",
      url: `/api/kobo/${koboToken}/v1/books/${bookId}/download`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("");
    expect(response.headers["content-type"]).toBe("application/octet-stream");
    expect(response.headers["content-length"]).toBe(String(Buffer.byteLength(koboBookBody)));
    expect(response.headers["accept-ranges"]).toBeUndefined();
    expect(response.headers["content-disposition"]).toContain(
      `filename="Kobo Caf_ Sample.epub"`
    );
    expect(response.headers["content-disposition"]).toContain(
      "filename*=UTF-8''Kobo%20Caf%C3%A9%20Sample.epub"
    );
  });

  it("does not warn when Kobo initialization falls back after an upstream 401", async () => {
    await app.inject({
      method: "DELETE",
      url: "/api/v1/admin/activity-log",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      payload: {
        scope: "kobo"
      }
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      if (String(input) === "https://storeapi.kobo.com/v1/initialization") {
        return new Response("{}", {
          status: 401,
          headers: { "content-type": "application/json" }
        });
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/kobo/${koboToken}/v1/initialization`
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["x-kobo-apitoken"]).toBe("e30=");
    } finally {
      globalThis.fetch = originalFetch;
    }

    const activityResponse = await app.inject({
      method: "GET",
      url: "/api/v1/admin/activity-log?scope=kobo&limit=20",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(activityResponse.statusCode).toBe(200);
    expect(
      (activityResponse.json() as Array<{ event: string }>).some(
        (entry) => entry.event === "kobo.initialization_fallback_used"
      )
    ).toBe(false);
  });

  it("writes detailed Kobo info logs only when debug logging is enabled", async () => {
    await app.inject({
      method: "DELETE",
      url: "/api/v1/admin/activity-log",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      payload: {
        scope: "kobo"
      }
    });

    const enableResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/app-settings",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      payload: {
        koboDebugLogging: true
      }
    });

    expect(enableResponse.statusCode).toBe(200);

    const downloadResponse = await app.inject({
      method: "HEAD",
      url: `/api/kobo/${koboToken}/v1/books/${bookId}/download`,
      headers: {
        range: "bytes=0-127"
      }
    });

    expect(downloadResponse.statusCode).toBe(200);

    const activityResponse = await app.inject({
      method: "GET",
      url: "/api/v1/admin/activity-log?scope=kobo&level=INFO&limit=20",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(activityResponse.statusCode).toBe(200);
    expect(activityResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "kobo.debug.request",
          details: expect.objectContaining({
            method: "HEAD",
            headers: expect.objectContaining({
              range: "bytes=0-127"
            })
          })
        }),
        expect.objectContaining({
          event: "kobo.debug.download",
          bookId,
          details: expect.objectContaining({
            bytes: Buffer.byteLength(koboBookBody),
            headRequest: true,
            range: "bytes=0-127"
          })
        }),
        expect.objectContaining({
          event: "kobo.debug.response",
          details: expect.objectContaining({
            statusCode: 200,
            headers: expect.objectContaining({
              "content-type": "application/octet-stream"
            })
          })
        })
      ])
    );
  });

  it("returns bearer token metadata from device auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/kobo/${koboToken}/v1/auth/device`,
      payload: {
        UserKey: "booklite"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().AccessToken).toBeTruthy();
    expect(response.json().RefreshToken).toBeTruthy();
    expect(response.json().TokenType).toBe("Bearer");
    expect(response.json().UserKey).toBe("booklite");
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
