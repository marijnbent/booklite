import { describe, it, expect } from "vitest";
import {
  getDisplayStatus,
  getStatusFilterBucket,
  formatSize,
  getShareBadgeData,
  updateBookInData,
  sortBooks,
  buildPanelCoverOptions,
  isVirtualCollection,
  SHARED_WITH_ME_COLLECTION_ID,
  UNCOLLECTED_COLLECTION_ID,
} from "../components/library/libraryShared";
import type { BookItem, CollectionItem } from "../components/library/libraryShared";

// Minimal BookItem builder
function makeBook(overrides: Partial<BookItem> & { id: number; title: string }): BookItem {
  return {
    author: null,
    series: null,
    description: null,
    coverPath: null,
    fileExt: "epub",
    fileSize: 0,
    koboSyncable: 0,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    progress: null,
    ...overrides,
  };
}

// Minimal CollectionItem builder
function makeCollection(overrides: Partial<CollectionItem> & { id: number }): CollectionItem {
  return {
    name: "Test",
    icon: null,
    book_count: 0,
    ...overrides,
  };
}

describe("getDisplayStatus", () => {
  it("returns UNREAD for null", () => {
    expect(getDisplayStatus(null)).toBe("UNREAD");
  });

  it("returns UNREAD for undefined", () => {
    expect(getDisplayStatus(undefined)).toBe("UNREAD");
  });

  it("returns UNREAD for UNSET", () => {
    expect(getDisplayStatus("UNSET")).toBe("UNREAD");
  });

  it("returns READ for READ", () => {
    expect(getDisplayStatus("READ")).toBe("READ");
  });

  it("returns READING for READING", () => {
    expect(getDisplayStatus("READING")).toBe("READING");
  });

  it("returns ABANDONED for ABANDONED", () => {
    expect(getDisplayStatus("ABANDONED")).toBe("ABANDONED");
  });
});

describe("getStatusFilterBucket", () => {
  it("returns UNREAD for null", () => {
    expect(getStatusFilterBucket(null)).toBe("UNREAD");
  });

  it("returns READING for READING", () => {
    expect(getStatusFilterBucket("READING")).toBe("READING");
  });

  it("returns READING for RE_READING", () => {
    expect(getStatusFilterBucket("RE_READING")).toBe("READING");
  });

  it("returns READING for PARTIALLY_READ", () => {
    expect(getStatusFilterBucket("PARTIALLY_READ")).toBe("READING");
  });

  it("returns READING for PAUSED", () => {
    expect(getStatusFilterBucket("PAUSED")).toBe("READING");
  });

  it("returns READ for READ", () => {
    expect(getStatusFilterBucket("READ")).toBe("READ");
  });

  it("returns ABANDONED for ABANDONED", () => {
    expect(getStatusFilterBucket("ABANDONED")).toBe("ABANDONED");
  });

  it("returns UNREAD for WONT_READ", () => {
    expect(getStatusFilterBucket("WONT_READ")).toBe("UNREAD");
  });
});

describe("formatSize", () => {
  it("formats 0 bytes", () => {
    expect(formatSize(0)).toBe("0 B");
  });

  it("formats bytes below 1 KB", () => {
    expect(formatSize(512)).toBe("512 B");
  });

  it("formats exactly 1 KB", () => {
    expect(formatSize(1024)).toBe("1 KB");
  });

  it("formats exactly 1 MB", () => {
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("formats 1.5 MB", () => {
    expect(formatSize(1536 * 1024)).toBe("1.5 MB");
  });
});

describe("getShareBadgeData", () => {
  it("returns null when not shared and no shareCount", () => {
    expect(getShareBadgeData({ isShared: false, shareCount: 0 })).toBeNull();
  });

  it("returns null when not shared and shareCount is undefined", () => {
    expect(getShareBadgeData({ isShared: false })).toBeNull();
  });

  it("returns username label when isShared with sharedByUsername", () => {
    const result = getShareBadgeData({ isShared: true, sharedByUsername: "alice" });
    expect(result).not.toBeNull();
    expect(result!.label).toBe("alice");
    expect(result!.title).toContain("alice");
  });

  it("returns share count label when not isShared but shareCount > 0", () => {
    const result = getShareBadgeData({ isShared: false, shareCount: 3 });
    expect(result).not.toBeNull();
    expect(result!.label).toBe("3");
  });
});

describe("updateBookInData", () => {
  it("updates book in a flat array", () => {
    const books = [
      makeBook({ id: 1, title: "Book A" }),
      makeBook({ id: 2, title: "Book B" }),
    ];
    const result = updateBookInData(books, 1, (b) => ({ ...b, title: "Updated A" }));
    expect(result[0].title).toBe("Updated A");
    expect(result[1].title).toBe("Book B");
  });

  it("updates book in BookPages shape", () => {
    const data = {
      pages: [
        [makeBook({ id: 1, title: "Book A" }), makeBook({ id: 2, title: "Book B" })],
      ],
      pageParams: [null],
    };
    const result = updateBookInData(data, 2, (b) => ({ ...b, title: "Updated B" }));
    expect(result.pages[0][1].title).toBe("Updated B");
    expect(result.pages[0][0].title).toBe("Book A");
  });

  it("updates a single BookItem when id matches", () => {
    const book = makeBook({ id: 5, title: "Single Book" });
    const result = updateBookInData(book, 5, (b) => ({ ...b, title: "Updated Single" }));
    expect(result.title).toBe("Updated Single");
  });

  it("returns data unchanged when bookId not found in array", () => {
    const books = [makeBook({ id: 1, title: "Book A" })];
    const result = updateBookInData(books, 99, (b) => ({ ...b, title: "Changed" }));
    expect(result[0].title).toBe("Book A");
  });
});

describe("sortBooks", () => {
  const bookA = makeBook({ id: 1, title: "Alpha", author: "Zelda", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-03-01T00:00:00Z" });
  const bookB = makeBook({ id: 2, title: "Beta", author: "Alice", createdAt: "2024-02-01T00:00:00Z", updatedAt: "2024-02-01T00:00:00Z" });
  const bookC = makeBook({ id: 3, title: "Gamma", author: "Bob", createdAt: "2024-03-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" });

  it("sorts by title ascending", () => {
    const books = [bookC, bookA, bookB];
    books.sort((a, b) => sortBooks(a, b, "title"));
    expect(books.map((b) => b.title)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("sorts by author ascending", () => {
    const books = [bookA, bookC, bookB];
    books.sort((a, b) => sortBooks(a, b, "author"));
    expect(books.map((b) => b.author)).toEqual(["Alice", "Bob", "Zelda"]);
  });

  it("sorts by created descending (newest first)", () => {
    const books = [bookA, bookB, bookC];
    books.sort((a, b) => sortBooks(a, b, "created"));
    expect(books.map((b) => b.id)).toEqual([3, 2, 1]);
  });

  it("sorts by updated descending (most recently updated first)", () => {
    const books = [bookC, bookA, bookB];
    books.sort((a, b) => sortBooks(a, b, "updated"));
    expect(books.map((b) => b.id)).toEqual([1, 2, 3]);
  });
});

describe("buildPanelCoverOptions", () => {
  it("returns empty array for null cover with no preview options", () => {
    expect(buildPanelCoverOptions(null, undefined)).toEqual([]);
  });

  it("returns one option for a valid cover path", () => {
    const result = buildPanelCoverOptions("/cover.jpg", undefined);
    expect(result).toHaveLength(1);
    expect(result[0].coverPath).toBe("/cover.jpg");
    expect(result[0].label).toBe("Current cover");
  });

  it("deduplicates options with the same path", () => {
    const previewOptions = [
      { coverPath: "/cover.jpg", source: "OPEN_LIBRARY" as const },
    ];
    const result = buildPanelCoverOptions("/cover.jpg", previewOptions);
    expect(result).toHaveLength(1);
  });

  it("includes distinct preview options", () => {
    const previewOptions = [
      { coverPath: "/other.jpg", source: "GOOGLE" as const },
    ];
    const result = buildPanelCoverOptions("/cover.jpg", previewOptions);
    expect(result).toHaveLength(2);
  });
});

describe("isVirtualCollection", () => {
  it("returns false for null", () => {
    expect(isVirtualCollection(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isVirtualCollection(undefined)).toBe(false);
  });

  it("returns true for SHARED_WITH_ME_COLLECTION_ID", () => {
    const col = makeCollection({ id: SHARED_WITH_ME_COLLECTION_ID });
    expect(isVirtualCollection(col)).toBe(true);
  });

  it("returns true for UNCOLLECTED_COLLECTION_ID", () => {
    const col = makeCollection({ id: UNCOLLECTED_COLLECTION_ID });
    expect(isVirtualCollection(col)).toBe(true);
  });

  it("returns true when virtual === 1", () => {
    const col = makeCollection({ id: 99, virtual: 1 });
    expect(isVirtualCollection(col)).toBe(true);
  });

  it("returns false for normal collection with virtual === 0", () => {
    const col = makeCollection({ id: 99, virtual: 0 });
    expect(isVirtualCollection(col)).toBe(false);
  });
});
