import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";

const { booksDir } = createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let accessToken = "";
let bookId = 0;
const bookBody = "regular-download-body";

describe("books download", () => {
  beforeAll(async () => {
    app = await setupTestApp();
    accessToken = (await setupOwnerAndLogin(app, "owner7@example.com", "owner7")).accessToken;

    const dbModule = await import("../src/db/client");
    const schema = await import("../src/db/schema");

    fs.writeFileSync(path.join(booksDir, "regular-download.epub"), bookBody);
    const timestamp = new Date().toISOString();
    const inserted = await dbModule.db
      .insert(schema.books)
      .values({
        ownerUserId: 1,
        title: "Regular Café Download",
        author: "Author",
        series: null,
        description: null,
        coverPath: null,
        filePath: "regular-download.epub",
        fileExt: "epub",
        fileSize: Buffer.byteLength(bookBody),
        koboSyncable: 1,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .returning({ id: schema.books.id });

    bookId = inserted[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns shared attachment headers for authenticated book downloads", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookId}/download`,
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(bookBody);
    expect(response.headers["content-type"]).toBe("application/octet-stream");
    expect(response.headers["content-length"]).toBe(String(Buffer.byteLength(bookBody)));
    expect(response.headers["accept-ranges"]).toBeUndefined();
    expect(response.headers["content-disposition"]).toContain(
      `filename="Regular Caf_ Download.epub"`
    );
    expect(response.headers["content-disposition"]).toContain(
      "filename*=UTF-8''Regular%20Caf%C3%A9%20Download.epub"
    );
  });
});
