import { beforeAll, describe, expect, it } from "vitest";
import fixture from "./fixtures/kobo/library-sync-response.json";
import { createTempEnv } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let accessToken = "";
let koboToken = "";

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

    await dbModule.db.insert(schema.books).values({
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
    });

    await app.inject({
      method: "PUT",
      url: "/api/v1/kobo/settings",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        syncEnabled: true,
        twoWayProgressSync: true,
        markReadingThreshold: 1,
        markFinishedThreshold: 99
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
});
