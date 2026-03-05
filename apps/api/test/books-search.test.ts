import { beforeAll, describe, expect, it } from "vitest";
import { createTempEnv } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let accessToken = "";

describe("books + search", () => {
  beforeAll(async () => {
    const appModule = await import("../src/app");
    app = appModule.buildApp();
    await app.ready();

    const dbModule = await import("../src/db/client");
    const schema = await import("../src/db/schema");

    await app.inject({
      method: "POST",
      url: "/api/v1/setup",
      payload: {
        email: "owner2@example.com",
        username: "owner2",
        password: "secret123"
      }
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        usernameOrEmail: "owner2",
        password: "secret123"
      }
    });

    accessToken = login.json().accessToken;

    await dbModule.db.insert(schema.books).values({
      ownerUserId: 1,
      title: "Searchable Book",
      author: "Author",
      series: null,
      description: "A searchable description",
      coverPath: null,
      filePath: "manual.epub",
      fileExt: "epub",
      fileSize: 1000,
      koboSyncable: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  it("supports FTS query", async () => {
    const search = await app.inject({
      method: "GET",
      url: "/api/v1/books?q=Searchable",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(search.statusCode).toBe(200);
    expect(search.json().length).toBeGreaterThan(0);
  });
});
