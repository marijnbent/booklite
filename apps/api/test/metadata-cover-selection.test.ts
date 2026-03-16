import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, unknown>();

vi.mock("../src/db/client", () => ({
  getSetting: vi.fn(async (key: string, fallback: unknown) =>
    settings.has(key) ? settings.get(key) : fallback
  )
}));

vi.mock("../src/config", () => ({
  config: {
    amazonBooksDomain: "com",
    amazonBooksCookie: "",
    googleBooksLanguage: "",
    googleBooksApiKey: "",
    hardcoverApiKey: ""
  }
}));

import { fetchMetadataPreview, fetchMetadataWithFallback } from "../src/services/metadata";

const mockJsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });

describe("metadata cover selection", () => {
  beforeEach(() => {
    settings.clear();
    vi.restoreAllMocks();
  });

  it("prefers a stronger edition cover over an Open Library cover", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("openlibrary.org/search.json")) {
        return mockJsonResponse({
          docs: [
            {
              title: "The Exact Match",
              author_name: ["Alice Author"],
              cover_i: 101
            }
          ]
        });
      }

      if (url.includes("googleapis.com/books/v1/volumes")) {
        return mockJsonResponse({
          items: [
            {
              volumeInfo: {
                title: "The Exact Match",
                authors: ["Alice Author"],
                description: "A richer Google listing",
                imageLinks: {
                  thumbnail: "https://books.google.com/books/content?id=test&printsec=frontcover&img=1&zoom=3"
                }
              }
            }
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataWithFallback("The Exact Match", "Alice Author");

    expect(result.coverPath).toBe(
      "https://books.google.com/books/content?id=test&printsec=frontcover&img=1&zoom=3"
    );
  });

  it("excludes wrong-book covers even when that provider has richer metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("openlibrary.org/search.json")) {
        return mockJsonResponse({
          docs: [
            {
              title: "The Exact Match",
              author_name: ["Alice Author"]
            }
          ]
        });
      }

      if (url.includes("googleapis.com/books/v1/volumes")) {
        return mockJsonResponse({
          items: [
            {
              volumeInfo: {
                title: "Different Book With Same Theme",
                authors: ["Someone Else"],
                description: "Looks richer but is the wrong book",
                imageLinks: {
                  thumbnail: "https://covers.example/wrong-book.jpg"
                }
              }
            }
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataWithFallback("The Exact Match", "Alice Author");

    expect(result.coverPath).toBeUndefined();
  });

  it("orders preview cover options by the smarter cover ranking", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("openlibrary.org/search.json")) {
        return mockJsonResponse({
          docs: [
            {
              title: "The Exact Match",
              author_name: ["Alice Author"],
              cover_i: 101
            }
          ]
        });
      }

      if (url.includes("googleapis.com/books/v1/volumes")) {
        return mockJsonResponse({
          items: [
            {
              volumeInfo: {
                title: "The Exact Match",
                authors: ["Alice Author"],
                imageLinks: {
                  thumbnail: "https://books.google.com/books/content?id=test&printsec=frontcover&img=1&zoom=3"
                }
              }
            }
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataPreview("The Exact Match", "Alice Author");

    expect(result.coverPath).toBe(
      "https://books.google.com/books/content?id=test&printsec=frontcover&img=1&zoom=3"
    );
    expect(result.coverOptions).toEqual([
      {
        coverPath: "https://books.google.com/books/content?id=test&printsec=frontcover&img=1&zoom=3",
        source: "GOOGLE"
      },
      {
        coverPath: "https://covers.openlibrary.org/b/id/101-L.jpg",
        source: "OPEN_LIBRARY"
      }
    ]);
  });
});
