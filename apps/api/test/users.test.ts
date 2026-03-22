import { beforeAll, describe, expect, it } from "vitest";
import { createTempEnv, setupTestApp } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let ownerAccessToken = "";

describe("users", () => {
  beforeAll(async () => {
    app = await setupTestApp();

    const setup = await app.inject({
      method: "POST",
      url: "/api/v1/setup",
      payload: {
        username: "owner-users",
        password: "secret123"
      }
    });

    expect(setup.statusCode).toBe(201);
    expect(setup.json()).toMatchObject({
      username: "owner-users",
      email: null,
      role: "OWNER"
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        usernameOrEmail: "owner-users",
        password: "secret123"
      }
    });

    expect(login.statusCode).toBe(200);
    ownerAccessToken = login.json<{ accessToken: string }>().accessToken;
  });

  it("allows setup and user creation without email", async () => {
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      }
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      username: "owner-users",
      email: null
    });

    const createMember = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      },
      payload: {
        username: "member-no-email",
        password: "secret123",
        role: "MEMBER"
      }
    });

    expect(createMember.statusCode).toBe(201);
    expect(createMember.json()).toMatchObject({
      username: "member-no-email",
      email: null,
      role: "MEMBER"
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        usernameOrEmail: "member-no-email",
        password: "secret123"
      }
    });

    expect(login.statusCode).toBe(200);
  });

  it("lets owners edit their own username and email", async () => {
    const beforeEdit = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      }
    });

    const owner = beforeEdit.json<{ id: number }>();

    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/users/${owner.id}`,
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      },
      payload: {
        email: "owner.updated@example.com",
        username: "owner-renamed"
      }
    });

    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({
      id: owner.id,
      email: "owner.updated@example.com",
      username: "owner-renamed"
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        usernameOrEmail: "owner.updated@example.com",
        password: "secret123"
      }
    });

    expect(login.statusCode).toBe(200);
    ownerAccessToken = login.json<{ accessToken: string }>().accessToken;
  });

  it("treats unchanged user patches as a no-op", async () => {
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      }
    });

    expect(me.statusCode).toBe(200);
    const owner = me.json<{ id: number; email: string | null; username: string; role: "OWNER"; createdAt: string; disabledAt: string | null }>();

    const noopUpdate = await app.inject({
      method: "PATCH",
      url: `/api/v1/users/${owner.id}`,
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      },
      payload: {
        email: owner.email,
        username: owner.username
      }
    });

    expect(noopUpdate.statusCode).toBe(200);
    expect(noopUpdate.json()).toMatchObject({
      id: owner.id,
      email: owner.email,
      username: owner.username
    });
  });

  it("deletes disabled users and blocks invalid deletions", async () => {
    const createDeleteTarget = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      },
      payload: {
        username: "delete-target",
        password: "secret123",
        role: "MEMBER"
      }
    });

    expect(createDeleteTarget.statusCode).toBe(201);
    const deleteTarget = createDeleteTarget.json<{ id: number }>();

    const deleteActive = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${deleteTarget.id}`,
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      }
    });

    expect(deleteActive.statusCode).toBe(409);

    const disableDeleteTarget = await app.inject({
      method: "PATCH",
      url: `/api/v1/users/${deleteTarget.id}`,
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      },
      payload: {
        disabled: true
      }
    });

    expect(disableDeleteTarget.statusCode).toBe(200);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${deleteTarget.id}`,
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      }
    });

    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ ok: true });

    const createBookOwner = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      },
      payload: {
        username: "disabled-book-owner",
        password: "secret123",
        role: "MEMBER"
      }
    });

    expect(createBookOwner.statusCode).toBe(201);
    const bookOwner = createBookOwner.json<{ id: number }>();

    const { db } = await import("../src/db/client");
    const schema = await import("../src/db/schema");
    const timestamp = new Date().toISOString();

    await db.insert(schema.books).values({
      ownerUserId: bookOwner.id,
      title: "Owned book",
      author: null,
      series: null,
      description: null,
      coverPath: null,
      filePath: `/tmp/owned-book-${bookOwner.id}.epub`,
      fileExt: "epub",
      fileSize: 1,
      koboSyncable: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const disableBookOwner = await app.inject({
      method: "PATCH",
      url: `/api/v1/users/${bookOwner.id}`,
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      },
      payload: {
        disabled: true
      }
    });

    expect(disableBookOwner.statusCode).toBe(200);

    const blockedDelete = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${bookOwner.id}`,
      headers: {
        authorization: `Bearer ${ownerAccessToken}`
      }
    });

    expect(blockedDelete.statusCode).toBe(409);
    expect(blockedDelete.json()).toEqual({
      error: "Disabled users with books cannot be deleted"
    });
  });
});
