import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let ownerAccessToken = "";
let memberAccessToken = "";
let memberId = 0;

describe("admin diagnostics", () => {
  beforeAll(async () => {
    app = await setupTestApp();
    ownerAccessToken = (await setupOwnerAndLogin(app, "owner-diag@example.com", "ownerdiag"))
      .accessToken;

    const createMember = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { authorization: `Bearer ${ownerAccessToken}` },
      payload: {
        email: "member-diag@example.com",
        username: "memberdiag",
        password: "secret123",
        role: "MEMBER"
      }
    });
    memberId = createMember.json<{ id: number }>().id;

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        usernameOrEmail: "memberdiag",
        password: "secret123"
      }
    });
    memberAccessToken = login.json().accessToken;

    const { logAdminActivity } = await import("../src/services/adminActivityLog");
    await logAdminActivity({
      scope: "kobo",
      event: "kobo.debug.test",
      level: "INFO",
      message: "Kobo diagnostic test entry",
      actorUserId: memberId,
      details: {
        device: "test-reader"
      }
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns owner-wide diagnostics to API docs tokens without exposing secrets", async () => {
    const settingsResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/app-settings",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`,
        "content-type": "application/json"
      },
      payload: {
        metadataGoogleApiKey: "secret-google-key",
        koboDebugLogging: true
      }
    });
    expect(settingsResponse.statusCode).toBe(200);

    const tokenResponse = await app.inject({
      method: "POST",
      url: "/api/v1/admin/api-docs/token",
      headers: { authorization: `Bearer ${ownerAccessToken}` },
      payload: {
        expiresInDays: 30,
        label: "Diagnostics"
      }
    });
    expect(tokenResponse.statusCode).toBe(200);
    const apiToken = tokenResponse.json<{ token: string }>().token;

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/diagnostics?scope=kobo&level=INFO&limit=10",
      headers: { authorization: `Bearer ${apiToken}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      settings: {
        koboDebugLogging: true,
        metadataGoogleApiKeyConfigured: true
      },
      users: expect.arrayContaining([
        expect.objectContaining({
          username: "ownerdiag",
          role: "OWNER",
          library: expect.any(Object),
          kobo: expect.any(Object)
        }),
        expect.objectContaining({
          id: memberId,
          username: "memberdiag",
          role: "MEMBER",
          importJobs: expect.any(Object)
        })
      ]),
      activityLog: expect.arrayContaining([
        expect.objectContaining({
          scope: "kobo",
          event: "kobo.debug.test",
          actorUserId: memberId,
          details: {
            device: "test-reader"
          }
        })
      ])
    });
    expect(JSON.stringify(response.json())).not.toContain("secret-google-key");
  });

  it("rejects member access", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/diagnostics",
      headers: { authorization: `Bearer ${memberAccessToken}` }
    });

    expect(response.statusCode).toBe(403);
  });
});
