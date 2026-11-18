import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let profile: Record<string, unknown> = {};

const provider = http.createServer((request, response) => {
  const origin = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
  const bodies: Record<string, unknown> = {
    "/.well-known/openid-configuration": {
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      userinfo_endpoint: `${origin}/userinfo`
    },
    "/token": { access_token: "provider-token" },
    "/userinfo": profile
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

const usernameFor = async (location: string): Promise<string> => {
  const refresh = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    payload: { refreshToken: location.split("#sso=")[1] }
  });
  const me = await app.inject({
    method: "GET",
    url: "/api/v1/me",
    headers: { authorization: `Bearer ${refresh.json().accessToken}` }
  });
  return me.json().username;
};

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
});
