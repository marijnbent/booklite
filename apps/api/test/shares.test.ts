import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTempEnv,
  createUserAndLogin,
  setupOwnerAndLogin,
  setupTestApp
} from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let ownerAccessToken = "";
let recipientAccessToken = "";
let ownerUserId = 0;
let recipientUserId = 0;
let bookId = 0;

describe("book shares", () => {
  beforeAll(async () => {
    app = await setupTestApp();

    ownerAccessToken = (
      await setupOwnerAndLogin(app, "owner-share@example.com", "owner-share")
    ).accessToken;

    recipientAccessToken = (
      await createUserAndLogin(app, ownerAccessToken, {
        email: "recipient-share@example.com",
        username: "recipient-share"
      })
    ).accessToken;

    const dbModule = await import("../src/db/client");
    const schema = await import("../src/db/schema");

    const owner = await dbModule.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, "owner-share"))
      .limit(1);

    const recipient = await dbModule.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, "recipient-share"))
      .limit(1);

    ownerUserId = owner[0].id;
    recipientUserId = recipient[0].id;

    const inserted = await dbModule.db
      .insert(schema.books)
      .values({
        ownerUserId,
        title: "Shared Systems",
        author: "Booklite Team",
        series: null,
        description: "A book used for share tests.",
        coverPath: null,
        filePath: "shared-systems.epub",
        fileExt: "epub",
        fileSize: 123,
        koboSyncable: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .returning({ id: schema.books.id });

    bookId = inserted[0].id;
  });

  it("keeps private books hidden until shared and lets recipients use them like normal library books", async () => {
    const beforeShare = await app.inject({
      method: "GET",
      url: "/api/v1/books",
      headers: { authorization: `Bearer ${recipientAccessToken}` }
    });

    expect(beforeShare.statusCode).toBe(200);
    expect(beforeShare.json()).toEqual([]);

    const share = await app.inject({
      method: "POST",
      url: `/api/v1/books/${bookId}/shares`,
      headers: { authorization: `Bearer ${ownerAccessToken}` },
      payload: { recipientUserId }
    });

    expect(share.statusCode).toBe(201);
    expect(share.json()).toMatchObject({
      recipientUserId,
      username: "recipient-share"
    });

    const ownerShareList = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookId}/shares`,
      headers: { authorization: `Bearer ${ownerAccessToken}` }
    });

    expect(ownerShareList.statusCode).toBe(200);
    expect(ownerShareList.json()).toHaveLength(1);

    const ownerBooks = await app.inject({
      method: "GET",
      url: "/api/v1/books",
      headers: { authorization: `Bearer ${ownerAccessToken}` }
    });

    expect(ownerBooks.statusCode).toBe(200);
    expect(ownerBooks.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bookId,
          isShared: false,
          shareCount: 1
        })
      ])
    );

    const recipientBooks = await app.inject({
      method: "GET",
      url: "/api/v1/books",
      headers: { authorization: `Bearer ${recipientAccessToken}` }
    });

    expect(recipientBooks.statusCode).toBe(200);
    expect(recipientBooks.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bookId,
          isShared: true,
          sharedByUsername: "owner-share"
        })
      ])
    );

    const createdCollection = await app.inject({
      method: "POST",
      url: "/api/v1/collections",
      headers: { authorization: `Bearer ${recipientAccessToken}` },
      payload: {
        name: "Shared shelf"
      }
    });

    expect(createdCollection.statusCode).toBe(201);
    const collectionId = createdCollection.json().id;

    const addToCollection = await app.inject({
      method: "POST",
      url: `/api/v1/collections/${collectionId}/books/${bookId}`,
      headers: { authorization: `Bearer ${recipientAccessToken}` }
    });

    expect(addToCollection.statusCode).toBe(200);

    const collectionBooks = await app.inject({
      method: "GET",
      url: `/api/v1/collections/${collectionId}/books`,
      headers: { authorization: `Bearer ${recipientAccessToken}` }
    });

    expect(collectionBooks.statusCode).toBe(200);
    expect(collectionBooks.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: bookId, isShared: true })])
    );

    const removeFromLibrary = await app.inject({
      method: "DELETE",
      url: `/api/v1/books/${bookId}/share`,
      headers: { authorization: `Bearer ${recipientAccessToken}` }
    });

    expect(removeFromLibrary.statusCode).toBe(204);

    const afterRemove = await app.inject({
      method: "GET",
      url: "/api/v1/books",
      headers: { authorization: `Bearer ${recipientAccessToken}` }
    });

    expect(afterRemove.statusCode).toBe(200);
    expect(afterRemove.json()).toEqual([]);

    const reshared = await app.inject({
      method: "POST",
      url: `/api/v1/books/${bookId}/shares`,
      headers: { authorization: `Bearer ${ownerAccessToken}` },
      payload: { recipientUserId }
    });

    expect(reshared.statusCode).toBe(201);

    const deleteBook = await app.inject({
      method: "DELETE",
      url: `/api/v1/books/${bookId}`,
      headers: { authorization: `Bearer ${ownerAccessToken}` }
    });

    expect(deleteBook.statusCode).toBe(200);

    const dbModule = await import("../src/db/client");
    const schema = await import("../src/db/schema");

    const remainingShares = await dbModule.db
      .select({ id: schema.bookShares.id })
      .from(schema.bookShares)
      .where(eq(schema.bookShares.bookId, bookId));

    expect(remainingShares).toEqual([]);
  });
});
