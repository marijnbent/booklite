import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let profile: Record<string, unknown> = {};

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const logoutEvent = { "http://schemas.openid.net/event/backchannel-logout": {} };

const provider = http.createServer((request, response) => {
  const origin = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
  const bodies: Record<string, unknown> = {
    "/.well-known/openid-configuration": {
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      userinfo_endpoint: `${origin}/userinfo`,
      end_session_endpoint: `${origin}/end-session`,
      jwks_uri: `${origin}/jwks`
    },
    "/token": { access_token: "provider-token", id_token: "provider-id-token" },
    "/userinfo": { sub: "subject-1", ...profile },
    "/jwks": { keys: [{ ...publicKey.export({ format: "jwk" }), kid: "key-1" }] }
  };
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(bodies[request.url ?? ""] ?? {}));
});

const signIn = async (tamperState = false) => {
  const start = await app.inject({ method: "GET", url: "/api/v1/auth/oidc/start" });
  const state = new URL(String(start.headers.location)).searchParams.get("state");
  return app.inject({
    method: "GET",
    url: `/api/v1/auth/oidc/callback?code=abc&state=${tamperState ? "other" : state}`,
    headers: { cookie: String(start.headers["set-cookie"]).split(";")[0] }
  });
};

const tokensFor = async (location: string) => {
  const refresh = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    payload: { refreshToken: new URLSearchParams(location.split("#")[1]).get("sso") }
  });
  return refresh.json() as { accessToken: string; refreshToken: string };
};

const me = (accessToken: string) =>
  app.inject({ method: "GET", url: "/api/v1/me", headers: { authorization: `Bearer ${accessToken}` } });

const usernameFor = async (location: string): Promise<string> =>
  (await me((await tokensFor(location)).accessToken)).json().username;

const notifyLogout = (claims: Record<string, unknown>, audience = "booklite") =>
  app.inject({
    method: "POST",
    url: "/api/v1/auth/oidc/backchannel-logout",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams({
      logout_token: jwt.sign(claims, privateKey, {
        algorithm: "RS256",
        keyid: "key-1",
        issuer: process.env.OIDC_ISSUER,
        audience,
        subject: "subject-1",
        expiresIn: 120
      })
    }).toString()
  });

describe("single sign-on", () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
    process.env.OIDC_ISSUER = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
    process.env.OIDC_CLIENT_ID = "booklite";
    process.env.OIDC_CLIENT_SECRET = "secret";
    app = await setupTestApp();
    await setupOwnerAndLogin(app, "owner@test.com", "owner");
  });

  afterAll(() => {
    provider.close();
  });

  it("signs in the account with the same verified email", async () => {
    profile = { email: "Owner@Test.com", email_verified: true, name: "Someone Else" };
    const callback = await signIn();
    expect(await usernameFor(String(callback.headers.location))).toBe("owner");
  });

  it("creates a member for an unknown verified email", async () => {
    profile = { email: "anne@test.com", email_verified: true, name: "Anne" };
    const callback = await signIn();
    expect(await usernameFor(String(callback.headers.location))).toBe("Anne");
  });

  it("refuses an unverified email and a mismatched state", async () => {
    profile = { email: "owner@test.com", email_verified: false };
    expect((await signIn()).headers.location).toBe("/login?error=sso");

    profile = { email: "owner@test.com", email_verified: true };
    expect((await signIn(true)).headers.location).toBe("/login?error=sso");
  });

  it("logs out at the provider and ends the session when the provider says so", async () => {
    profile = { email: "owner@test.com", email_verified: true };
    const location = String((await signIn()).headers.location);
    expect(new URLSearchParams(location.split("#")[1]).get("id_token")).toBe("provider-id-token");
    const tokens = await tokensFor(location);

    const endSession = await app.inject({
      method: "POST",
      url: "/api/v1/auth/oidc/end-session",
      payload: { idToken: "provider-id-token" }
    });
    const url = new URL(endSession.json().url);
    expect(url.pathname).toBe("/end-session");
    expect(url.searchParams.get("id_token_hint")).toBe("provider-id-token");
    expect(url.searchParams.get("post_logout_redirect_uri")).toMatch(/\/$/);

    expect((await notifyLogout({ events: logoutEvent }, "other-app")).statusCode).toBe(400);
    expect((await notifyLogout({})).statusCode).toBe(400);
    expect((await me(tokens.accessToken)).statusCode).toBe(200);

    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 2000 });
    expect((await notifyLogout({ events: logoutEvent })).statusCode).toBe(204);
    vi.useRealTimers();
    expect((await me(tokens.accessToken)).statusCode).toBe(401);
    const refresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: tokens.refreshToken }
    });
    expect(refresh.statusCode).toBe(401);
  });
});
