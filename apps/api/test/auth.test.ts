import { beforeAll, describe, expect, it } from "vitest";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;

describe("auth", () => {
  beforeAll(async () => {
    app = await setupTestApp();
  });

  it("supports setup + login + me", async () => {
    const setup = await app.inject({
      method: "POST",
      url: "/api/v1/setup",
      payload: {
        email: " Owner@Example.com ",
        username: " owner ",
        password: "secret123"
      }
    });

    expect(setup.statusCode).toBe(201);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        usernameOrEmail: " owner@example.com ",
        password: "secret123"
      }
    });

    expect(login.statusCode).toBe(200);
    const tokens = login.json();
    expect(tokens.accessToken).toBeTypeOf("string");
    expect(tokens.refreshToken).toBeTypeOf("string");

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`
      }
    });

    expect(me.statusCode).toBe(200);
    expect(me.json().username).toBe("owner");
    expect(me.json().email).toBe("owner@example.com");
  });

  it("refresh rotates tokens", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        usernameOrEmail: "owner",
        password: "secret123"
      }
    });

    const first = login.json();

    const refreshed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: {
        refreshToken: first.refreshToken
      }
    });

    expect(refreshed.statusCode).toBe(200);
    const second = refreshed.json();
    expect(second.refreshToken).not.toBe(first.refreshToken);
  });

  it("allows owners to generate an API docs token", async () => {
    const tokens = await setupOwnerAndLogin(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/api-docs/token",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`
      },
      payload: {
        expiresInDays: 30,
        label: "LLM"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      token: expect.any(String),
      expiresInDays: 30,
      label: "LLM"
    });
  });

  it("rejects API docs token generation for members", async () => {
    const ownerTokens = await setupOwnerAndLogin(app);

    const createMember = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: {
        authorization: `Bearer ${ownerTokens.accessToken}`
      },
      payload: {
        email: "member@example.com",
        username: "member",
        password: "secret123",
        role: "MEMBER"
      }
    });
    expect(createMember.statusCode).toBe(201);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        usernameOrEmail: "member",
        password: "secret123"
      }
    });

    const tokens = login.json();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/api-docs/token",
      headers: {
        authorization: `Bearer ${tokens.accessToken}`
      },
      payload: {
        expiresInDays: 30
      }
    });

    expect(response.statusCode).toBe(403);
  });
});
