import { beforeAll, describe, expect, it } from "vitest";
import { createTempEnv } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let accessToken = "";

describe("collections", () => {
  beforeAll(async () => {
    const appModule = await import("../src/app");
    app = appModule.buildApp();
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/api/v1/setup",
      payload: {
        email: "owner3@example.com",
        username: "owner3",
        password: "secret123"
      }
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        usernameOrEmail: "owner3",
        password: "secret123"
      }
    });

    accessToken = login.json().accessToken;
  });

  it("creates and lists collections", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/collections",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: "Favorites",
        icon: "star"
      }
    });

    expect(created.statusCode).toBe(201);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/collections",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(list.statusCode).toBe(200);
    expect(list.json().some((c: any) => c.name === "Favorites")).toBe(true);
  });
});
