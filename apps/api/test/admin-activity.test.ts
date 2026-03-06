import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let ownerAccessToken = "";
let memberAccessToken = "";

describe("admin activity log", () => {
  beforeAll(async () => {
    app = await setupTestApp();
    ownerAccessToken = (await setupOwnerAndLogin(app, "owner-log@example.com", "ownerlog"))
      .accessToken;

    await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { authorization: `Bearer ${ownerAccessToken}` },
      payload: {
        email: "member-log@example.com",
        username: "memberlog",
        password: "secret123",
        role: "MEMBER"
      }
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        usernameOrEmail: "memberlog",
        password: "secret123"
      }
    });
    memberAccessToken = login.json().accessToken;

    const { logAdminActivity } = await import("../src/services/adminActivityLog");
    await logAdminActivity({
      scope: "metadata",
      event: "metadata.provider_failed",
      message: "Metadata provider request failed",
      actorUserId: 1,
      details: {
        provider: "google",
        error: new Error("google timeout")
      }
    });
    await logAdminActivity({
      scope: "kobo",
      event: "kobo.library_sync_failed",
      message: "Kobo library sync payload generation failed",
      actorUserId: 1,
      details: {
        baselineSnapshotId: "snapshot-1"
      }
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists activity entries for owners and supports scope filtering", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/activity-log?scope=metadata&limit=10",
      headers: { authorization: `Bearer ${ownerAccessToken}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      {
        scope: "metadata",
        event: "metadata.provider_failed",
        actorUserId: 1,
        details: {
          provider: "google"
        }
      }
    ]);
  });

  it("rejects non-owner access", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/activity-log",
      headers: { authorization: `Bearer ${memberAccessToken}` }
    });

    expect(response.statusCode).toBe(403);
  });

  it("clears scoped activity entries", async () => {
    const clearResponse = await app.inject({
      method: "DELETE",
      url: "/api/v1/admin/activity-log",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`,
        "content-type": "application/json"
      },
      payload: {
        scope: "kobo"
      }
    });

    expect(clearResponse.statusCode).toBe(200);
    expect(clearResponse.json()).toMatchObject({ ok: true, cleared: 1 });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/admin/activity-log?limit=20",
      headers: { authorization: `Bearer ${ownerAccessToken}` }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject([
      {
        scope: "metadata"
      }
    ]);
    expect(
      (listResponse.json() as Array<{ scope: string }>).some((entry) => entry.scope === "kobo")
    ).toBe(false);
  });
});
