import { beforeAll, describe, expect, it } from "vitest";
import { createTempEnv, setupTestApp } from "./helpers";

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
});
