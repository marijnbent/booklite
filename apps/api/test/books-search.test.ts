import { beforeAll, describe, expect, it } from "vitest";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let accessToken = "";

describe("books + search", () => {
  beforeAll(async () => {
    app = await setupTestApp();

    const dbModule = await import("../src/db/client");
    const schema = await import("../src/db/schema");

    accessToken = (await setupOwnerAndLogin(app, "owner2@example.com", "owner2")).accessToken;

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
