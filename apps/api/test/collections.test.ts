import { beforeAll, describe, expect, it } from "vitest";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let accessToken = "";
let bookId = 0;


describe("collections", () => {
  beforeAll(async () => {
    app = await setupTestApp();
    accessToken = (await setupOwnerAndLogin(app, "owner3@example.com", "owner3")).accessToken;

    const dbModule = await import("../src/db/client");
    const schema = await import("../src/db/schema");

    const inserted = await dbModule.db.insert(schema.books).values({
      ownerUserId: 1,
      title: "Collections Sample",
      author: "Author",
      series: null,
      description: null,
      coverPath: null,
      filePath: "collections.epub",
      fileExt: "epub",
      fileSize: 100,
      koboSyncable: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).returning({ id: schema.books.id });

    bookId = inserted[0].id;
  });

  it("creates and lists collections including system favorites", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/collections",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: "Reading Next",
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
    const body = list.json();
    expect(body.some((c: any) => c.name === "Reading Next")).toBe(true);
    expect(body.some((c: any) => c.slug === "favorites" && c.is_system === 1)).toBe(true);
  });

  it("prevents rename/delete of favorites system collection", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/collections",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const favorites = list.json().find((c: any) => c.slug === "favorites");

    const rename = await app.inject({
      method: "PATCH",
      url: `/api/v1/collections/${favorites.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Favs" }
    });

    expect(rename.statusCode).toBe(400);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/collections/${favorites.id}`,
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(del.statusCode).toBe(400);
  });

  it("toggles favorite and replaces book collection assignments", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/collections",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const favorites = list.json().find((c: any) => c.slug === "favorites");
    const custom = list.json().find((c: any) => c.name === "Reading Next");

    const favoriteOn = await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookId}/favorite`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { favorite: true }
    });
    expect(favoriteOn.statusCode).toBe(200);

    const assignedAfterFavorite = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookId}/collections`,
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(assignedAfterFavorite.statusCode).toBe(200);
    expect(
      assignedAfterFavorite.json().find((c: any) => c.id === favorites.id)?.assigned
    ).toBe(true);

    const replaceCollections = await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookId}/collections`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        collectionIds: [custom.id]
      }
    });
    expect(replaceCollections.statusCode).toBe(200);

    const assignedAfterReplace = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookId}/collections`,
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(
      assignedAfterReplace.json().find((c: any) => c.id === favorites.id)?.assigned
    ).toBe(false);
    expect(
      assignedAfterReplace.json().find((c: any) => c.id === custom.id)?.assigned
    ).toBe(true);
  });

  it("reports kobo-syncable counts separately from total collection size", async () => {
    const listBefore = await app.inject({
      method: "GET",
      url: "/api/v1/collections",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const custom = listBefore.json().find((c: any) => c.name === "Reading Next");

    expect(custom?.book_count).toBe(1);
    expect(custom?.kobo_syncable_count).toBe(1);

    const dbModule = await import("../src/db/client");
    const schema = await import("../src/db/schema");

    const inserted = await dbModule.db.insert(schema.books).values({
      ownerUserId: 1,
      title: "Unsyncable in Collection",
      author: "Author",
      series: null,
      description: null,
      coverPath: null,
      filePath: "unsyncable-in-collection.pdf",
      fileExt: "pdf",
      fileSize: 100,
      koboSyncable: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).returning({ id: schema.books.id });

    const addUnsyncableBook = await app.inject({
      method: "PUT",
      url: `/api/v1/books/${inserted[0].id}/collections`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        collectionIds: [custom.id]
      }
    });

    expect(addUnsyncableBook.statusCode).toBe(200);

    const listAfter = await app.inject({
      method: "GET",
      url: "/api/v1/collections",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const customAfter = listAfter.json().find((c: any) => c.name === "Reading Next");

    expect(customAfter?.book_count).toBe(2);
    expect(customAfter?.kobo_syncable_count).toBe(1);
  });

  it("treats favorites as collected for the uncollected shelf", async () => {
    const dbModule = await import("../src/db/client");
    const schema = await import("../src/db/schema");

    const inserted = await dbModule.db.insert(schema.books).values({
      ownerUserId: 1,
      title: "Favorites Only",
      author: "Author",
      series: null,
      description: null,
      coverPath: null,
      filePath: "favorites-only.epub",
      fileExt: "epub",
      fileSize: 100,
      koboSyncable: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).returning({ id: schema.books.id });

    const favoriteOnlyBookId = inserted[0].id;

    const uncollectedBefore = await app.inject({
      method: "GET",
      url: "/api/v1/collections/uncollected/books",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(uncollectedBefore.statusCode).toBe(200);
    expect(uncollectedBefore.json().some((book: any) => book.id === favoriteOnlyBookId)).toBe(true);

    const virtualCollectionsBefore = await app.inject({
      method: "GET",
      url: "/api/v1/collections?includeVirtual=true",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    const uncollectedCountBefore = virtualCollectionsBefore
      .json()
      .find((collection: any) => collection.slug === "uncollected")?.book_count;

    const favoriteOn = await app.inject({
      method: "PUT",
      url: `/api/v1/books/${favoriteOnlyBookId}/favorite`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { favorite: true }
    });

    expect(favoriteOn.statusCode).toBe(200);

    const uncollectedAfter = await app.inject({
      method: "GET",
      url: "/api/v1/collections/uncollected/books",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(uncollectedAfter.statusCode).toBe(200);
    expect(uncollectedAfter.json().some((book: any) => book.id === favoriteOnlyBookId)).toBe(false);

    const virtualCollectionsAfter = await app.inject({
      method: "GET",
      url: "/api/v1/collections?includeVirtual=true",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    const uncollectedCountAfter = virtualCollectionsAfter
      .json()
      .find((collection: any) => collection.slug === "uncollected")?.book_count;

    expect(uncollectedCountAfter).toBe(uncollectedCountBefore - 1);
  });
});
