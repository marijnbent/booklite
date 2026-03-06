import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let ownerAccessToken = "";
let ownerUserId = 0;
let dbModule: typeof import("../src/db/client");
let schemaModule: typeof import("../src/db/schema");
let bookCounter = 0;

const patchProgress = async (
  bookId: number,
  payload: Record<string, unknown>
) =>
  app.inject({
    method: "PATCH",
    url: `/api/v1/books/${bookId}`,
    headers: {
      authorization: `Bearer ${ownerAccessToken}`,
      "content-type": "application/json"
    },
    payload
  });

const getBook = async (bookId: number) =>
  app.inject({
    method: "GET",
    url: `/api/v1/books/${bookId}`,
    headers: {
      authorization: `Bearer ${ownerAccessToken}`
    }
  });

const createBook = async () => {
  bookCounter += 1;
  const [book] = await dbModule.db
    .insert(schemaModule.books)
    .values({
      ownerUserId,
      title: `Reader Test ${bookCounter}`,
      author: "BookLite",
      series: null,
      description: null,
      coverPath: null,
      filePath: `reader-test-${bookCounter}.epub`,
      fileExt: "epub",
      fileSize: 1024,
      koboSyncable: 0,
      createdAt: "2026-03-06T00:00:00.000Z",
      updatedAt: "2026-03-06T00:00:00.000Z"
    })
    .returning({ id: schemaModule.books.id });

  return book.id;
};

const setThresholds = async (markReadingThreshold: number, markFinishedThreshold: number) => {
  await dbModule.db
    .update(schemaModule.koboUserSettings)
    .set({
      markReadingThreshold,
      markFinishedThreshold,
      updatedAt: "2026-03-06T00:00:00.000Z"
    })
    .where(eq(schemaModule.koboUserSettings.userId, ownerUserId));
};

describe("book progress inference", () => {
  beforeAll(async () => {
    app = await setupTestApp();
    ownerAccessToken = (await setupOwnerAndLogin(app)).accessToken;

    dbModule = await import("../src/db/client");
    schemaModule = await import("../src/db/schema");

    const [owner] = await dbModule.db
      .select({ id: schemaModule.users.id })
      .from(schemaModule.users)
      .where(eq(schemaModule.users.username, "owner"))
      .limit(1);

    ownerUserId = owner.id;
  });

  it("keeps progress below the reading threshold as unread", async () => {
    const bookId = await createBook();
    await setThresholds(10, 80);

    const response = await patchProgress(bookId, { progressPercent: 9 });
    expect(response.statusCode).toBe(200);

    const detail = await getBook(bookId);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().progress).toMatchObject({
      status: "UNREAD",
      progressPercent: 9
    });
  });

  it("marks progress at the reading threshold as reading", async () => {
    const bookId = await createBook();
    await setThresholds(10, 80);

    const response = await patchProgress(bookId, { progressPercent: 10 });
    expect(response.statusCode).toBe(200);

    const detail = await getBook(bookId);
    expect(detail.json().progress).toMatchObject({
      status: "READING",
      progressPercent: 10
    });
  });

  it("marks progress at the finished threshold as done", async () => {
    const bookId = await createBook();
    await setThresholds(10, 80);

    const response = await patchProgress(bookId, { progressPercent: 80 });
    expect(response.statusCode).toBe(200);

    const detail = await getBook(bookId);
    expect(detail.json().progress).toMatchObject({
      status: "DONE",
      progressPercent: 80
    });
  });

  it("preserves explicit manual status over inferred status", async () => {
    const bookId = await createBook();
    await setThresholds(10, 80);

    const response = await patchProgress(bookId, {
      status: "READING",
      progressPercent: 100
    });
    expect(response.statusCode).toBe(200);

    const detail = await getBook(bookId);
    expect(detail.json().progress).toMatchObject({
      status: "READING",
      progressPercent: 100
    });
  });

  it("creates missing Kobo settings before inferring status", async () => {
    const bookId = await createBook();

    await dbModule.db
      .delete(schemaModule.koboUserSettings)
      .where(eq(schemaModule.koboUserSettings.userId, ownerUserId));

    const response = await patchProgress(bookId, { progressPercent: 1 });
    expect(response.statusCode).toBe(200);

    const detail = await getBook(bookId);
    expect(detail.json().progress).toMatchObject({
      status: "READING",
      progressPercent: 1
    });

    const [settings] = await dbModule.db
      .select({
        markReadingThreshold: schemaModule.koboUserSettings.markReadingThreshold,
        markFinishedThreshold: schemaModule.koboUserSettings.markFinishedThreshold
      })
      .from(schemaModule.koboUserSettings)
      .where(eq(schemaModule.koboUserSettings.userId, ownerUserId))
      .limit(1);

    expect(settings).toMatchObject({
      markReadingThreshold: 1,
      markFinishedThreshold: 99
    });
  });
});
