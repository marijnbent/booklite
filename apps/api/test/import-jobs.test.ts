import { beforeAll, describe, expect, it } from "vitest";
import type { AuthTokens } from "@booklite/shared";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let ownerAccessToken = "";
let memberAccessToken = "";
let dbModule: typeof import("../src/db/client");
let schemaModule: typeof import("../src/db/schema");

describe("import jobs", () => {
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

  it("returns batched job statuses for the current user only", async () => {
    const users = await dbModule.db
      .select({
        id: schemaModule.users.id,
        username: schemaModule.users.username
      })
      .from(schemaModule.users);

    const ownerUser = users.find((user) => user.username === "owner");
    const memberUser = users.find((user) => user.username === "member");

    expect(ownerUser).toBeDefined();
    expect(memberUser).toBeDefined();

    await dbModule.db.insert(schemaModule.importJobs).values([
      {
        id: "job-owner-queued",
        userId: ownerUser!.id,
        status: "QUEUED",
        type: "UPLOAD",
        payloadJson: JSON.stringify({ fileName: "one.epub" }),
        resultJson: null,
        error: null,
        createdAt: "2026-03-06T10:00:00.000Z",
        updatedAt: "2026-03-06T10:00:00.000Z"
      },
      {
        id: "job-owner-complete",
        userId: ownerUser!.id,
        status: "COMPLETED",
        type: "UPLOAD",
        payloadJson: JSON.stringify({ fileName: "two.epub" }),
        resultJson: JSON.stringify({ bookId: 42 }),
        error: null,
        createdAt: "2026-03-06T10:01:00.000Z",
        updatedAt: "2026-03-06T10:01:30.000Z"
      },
      {
        id: "job-member-private",
        userId: memberUser!.id,
        status: "FAILED",
        type: "UPLOAD",
        payloadJson: JSON.stringify({ fileName: "secret.epub" }),
        resultJson: null,
        error: "hidden",
        createdAt: "2026-03-06T10:02:00.000Z",
        updatedAt: "2026-03-06T10:02:10.000Z"
      }
    ]);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/import-jobs/query",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`,
        "content-type": "application/json"
      },
      payload: {
        ids: ["job-owner-complete", "job-member-private", "job-owner-queued"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      jobs: [
        {
          id: "job-owner-complete",
          status: "COMPLETED",
          type: "UPLOAD",
          payload: { fileName: "two.epub" },
          result: { bookId: 42 },
          error: null,
          createdAt: "2026-03-06T10:01:00.000Z",
          updatedAt: "2026-03-06T10:01:30.000Z"
        },
        {
          id: "job-owner-queued",
          status: "QUEUED",
          type: "UPLOAD",
          payload: { fileName: "one.epub" },
          result: null,
          error: null,
          createdAt: "2026-03-06T10:00:00.000Z",
          updatedAt: "2026-03-06T10:00:00.000Z"
        }
      ]
    });

    const memberResponse = await app.inject({
      method: "POST",
      url: "/api/v1/import-jobs/query",
      headers: {
        authorization: `Bearer ${memberAccessToken}`,
        "content-type": "application/json"
      },
      payload: {
        ids: ["job-owner-queued", "job-member-private"]
      }
    });

    expect(memberResponse.statusCode).toBe(200);
    expect(memberResponse.json()).toEqual({
      jobs: [
        {
          id: "job-member-private",
          status: "FAILED",
          type: "UPLOAD",
          payload: { fileName: "secret.epub" },
          result: null,
          error: "hidden",
          createdAt: "2026-03-06T10:02:00.000Z",
          updatedAt: "2026-03-06T10:02:10.000Z"
        }
      ]
    });
  });
});
