import { beforeAll, describe, expect, it } from "vitest";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";
import type { AuthTokens } from "@booklite/shared";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let ownerAccessToken = "";
let memberAccessToken = "";
let dbModule: typeof import("../src/db/client");
let schemaModule: typeof import("../src/db/schema");

describe("app settings", () => {
  beforeAll(async () => {
    app = await setupTestApp();
    ownerAccessToken = (await setupOwnerAndLogin(app)).accessToken;

    await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      },
      payload: {
        email: "member@test.com",
        username: "member",
        password: "secret123",
        role: "MEMBER"
      }
    });

    memberAccessToken = (
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          usernameOrEmail: "member",
          password: "secret123"
        }
      })
    ).json<AuthTokens>().accessToken;

    dbModule = await import("../src/db/client");
    schemaModule = await import("../src/db/schema");
  });

  it("omits manual provider-order fields and returns provider enable settings", async () => {
    await dbModule.db
      .insert(schemaModule.appSettings)
      .values({
        key: "metadata_provider_primary",
        valueJson: JSON.stringify("audible")
      })
      .onConflictDoUpdate({
        target: schemaModule.appSettings.key,
        set: { valueJson: JSON.stringify("audible") }
      });

    await dbModule.db
      .insert(schemaModule.appSettings)
      .values({
        key: "metadata_provider_secondary",
        valueJson: JSON.stringify("comicvine")
      })
      .onConflictDoUpdate({
        target: schemaModule.appSettings.key,
        set: { valueJson: JSON.stringify("comicvine") }
      });

    await dbModule.db
      .insert(schemaModule.appSettings)
      .values({
        key: "metadata_provider_tertiary",
        valueJson: JSON.stringify("ranobedb")
      })
      .onConflictDoUpdate({
        target: schemaModule.appSettings.key,
        set: { valueJson: JSON.stringify("ranobedb") }
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/app-settings",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;

    expect(body).toHaveProperty("metadataProviderEnabled");
    expect(body.metadataProviderEnabled).toEqual({
      open_library: true,
      amazon: true,
      bol: false,
      google: true,
      hardcover: false,
      goodreads: true,
      douban: false
    });
    expect(body.metadataOpenrouterModel).toBe("");
    expect(body.koboDebugLogging).toBe(false);
    expect(body).not.toHaveProperty("metadataProviderPrimary");
    expect(body).not.toHaveProperty("metadataProviderSecondary");
    expect(body).not.toHaveProperty("metadataProviderTertiary");
    expect(body).not.toHaveProperty("metadataFieldProviders");
    expect(body).not.toHaveProperty("metadataComicvineApiKey");
    expect(body).not.toHaveProperty("metadataAudibleDomain");
  });

  it("rejects removed provider values in PATCH", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/app-settings",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`,
        "content-type": "application/json"
      },
      payload: {
        metadataProviderPrimary: "audible"
      }
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      error?: string;
      message?: string;
      issues?: Array<{ code?: string; path?: string[] }>;
    };
    expect(body.error).toBe("BAD_REQUEST");
    expect(body.message).toBe("Invalid app settings payload");
    expect(body.issues?.[0]?.code).toBe("unrecognized_keys");
    expect(body.issues?.[0]?.path).toEqual([]);
  });

  it("stores ebook download URL and exposes it through the public settings endpoint", async () => {
    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/app-settings",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`,
        "content-type": "application/json"
      },
      payload: {
        ebookDownloadUrl: "https://example.com/ebooks"
      }
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toMatchObject({
      ebookDownloadUrl: "https://example.com/ebooks"
    });

    const publicResponse = await app.inject({
      method: "GET",
      url: "/api/v1/app-settings/public",
      headers: {
        authorization: `Bearer ${memberAccessToken}`
      }
    });

    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.json()).toEqual({
      ebookDownloadUrl: "https://example.com/ebooks"
    });
  });

  it("stores the Kobo debug logging flag", async () => {
    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/app-settings",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`,
        "content-type": "application/json"
      },
      payload: {
        koboDebugLogging: true
      }
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toMatchObject({
      koboDebugLogging: true
    });

    const getResponse = await app.inject({
      method: "GET",
      url: "/api/v1/app-settings",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      }
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({
      koboDebugLogging: true
    });
  });
});
