import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempEnv, createUserAndLogin, setupOwnerAndLogin, setupTestApp } from "./helpers";

createTempEnv();
let app: Awaited<ReturnType<typeof setupTestApp>>;
let ownerToken: string;
let memberToken: string;
const headers = (token: string) => ({ authorization: `Bearer ${token}` });

describe("user accent", () => {
  beforeAll(async () => {
    app = await setupTestApp();
    ownerToken = (await setupOwnerAndLogin(app)).accessToken;
    memberToken = (await createUserAndLogin(app, ownerToken, { username: "accent-member", email: "accent@example.test" })).accessToken;
  });
  afterAll(async () => { await app.close(); });

  it("defaults to null and persists a member preference independently", async () => {
    const initial = await app.inject({ method: "GET", url: "/api/v1/me", headers: headers(memberToken) });
    expect(initial.json().accentColor).toBeNull();
    const update = await app.inject({ method: "PATCH", url: "/api/v1/me", headers: headers(memberToken), payload: { accentColor: "violet" } });
    expect(update.statusCode).toBe(200);
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { usernameOrEmail: "accent-member", password: "secret123" } });
    const reloaded = await app.inject({ method: "GET", url: "/api/v1/me", headers: headers(login.json().accessToken) });
    expect(reloaded.json().accentColor).toBe("violet");
    const owner = await app.inject({ method: "GET", url: "/api/v1/me", headers: headers(ownerToken) });
    expect(owner.json().accentColor).toBeNull();
    const other = await app.inject({ method: "PATCH", url: `/api/v1/users/${owner.json().id}`, headers: headers(memberToken), payload: { accentColor: "rose" } });
    expect(other.statusCode).toBe(403);
  });

  it("validates values and refuses target IDs or unrelated profile changes", async () => {
    for (const payload of [{ accentColor: "invalid" }, { accentColor: "blue", id: 1 }, { accentColor: "green", role: "OWNER" }, {}]) {
      const response = await app.inject({ method: "PATCH", url: "/api/v1/me", headers: headers(memberToken), payload });
      expect(response.statusCode).toBe(400);
    }
    const anonymous = await app.inject({ method: "PATCH", url: "/api/v1/me", payload: { accentColor: "blue" } });
    expect(anonymous.statusCode).toBe(401);
  });

  it("accepts every preset and resets to the default with null", async () => {
    for (const accentColor of ["orange", "rose", "violet", "blue", "teal", "green", "none", null]) {
      const response = await app.inject({ method: "PATCH", url: "/api/v1/me", headers: headers(memberToken), payload: { accentColor } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ accentColor });
    }
  });
});
