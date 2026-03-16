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

import { fetchMetadataWithFallback } from "../src/services/metadata";

const mockJsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });

describe("metadata merge", () => {
  beforeEach(() => {
    settings.clear();
    vi.restoreAllMocks();
  });

  it("does not merge author or description from a weak provider match", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("openlibrary.org/search.json")) {
        return mockJsonResponse({ docs: [{ title: "Some Title" }] });
      }

      if (url.includes("googleapis.com/books/v1/volumes")) {
        return mockJsonResponse({
          items: [
            {
              volumeInfo: {
                title: "Other Book",
                authors: ["Merged Author"],
                description: "Merged Description",
                imageLinks: { thumbnail: "https://covers.example/cover.jpg" }
              }
            }
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataWithFallback("Some Title", "Some Author");

    expect(result).toEqual({
      source: "OPEN_LIBRARY",
      title: "Some Title"
    });
  });

  it("still merges author and description from a strong provider match", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("openlibrary.org/search.json")) {
        return mockJsonResponse({ docs: [{ title: "Some Title" }] });
      }

      if (url.includes("googleapis.com/books/v1/volumes")) {
        return mockJsonResponse({
          items: [
            {
              volumeInfo: {
                title: "Some Title",
                authors: ["Merged Author"],
                description: "Merged Description"
              }
            }
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataWithFallback("Some Title", "Some Author");

    expect(result).toMatchObject({
      source: "GOOGLE",
      title: "Some Title",
      author: "Merged Author",
      description: "Merged Description"
    });
  });

  it("continues to next provider when a provider throws", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("openlibrary.org/search.json")) {
        throw new Error("Open Library failure");
      }

      if (url.includes("googleapis.com/books/v1/volumes")) {
        return mockJsonResponse({
          items: [
            {
              volumeInfo: {
                title: "Some Title",
                authors: ["Google Author"]
              }
            }
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataWithFallback("Some Title", "Some Author");

    expect(result).toMatchObject({
      source: "GOOGLE",
      title: "Some Title",
      author: "Google Author"
    });
  });

  it("returns NONE when all providers fail or return no metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("openlibrary.org/search.json")) {
        return new Response("", { status: 503 });
      }

      if (url.includes("googleapis.com/books/v1/volumes")) {
        throw new Error("Google failure");
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataWithFallback("Some Title", "Some Author");

    expect(result).toEqual({ source: "NONE" });
  });

  it("skips disabled providers and resolves fields from enabled providers", async () => {
    settings.set("metadata_provider_enabled", {
      open_library: false,
      amazon: false,
      bol: false,
      google: true,
      hardcover: false,
      goodreads: false,
      douban: false
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("openlibrary.org/search.json")) {
        throw new Error("Open Library should not be called when disabled");
      }

      if (url.includes("googleapis.com/books/v1/volumes")) {
        return mockJsonResponse({
          items: [
            {
              volumeInfo: {
                title: "Some Title",
                authors: ["Enabled Google Author"]
              }
            }
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataWithFallback("Some Title", "Some Author");

    expect(result).toMatchObject({
      source: "GOOGLE",
      title: "Some Title",
      author: "Enabled Google Author"
    });
  });

  it("selects the best Open Library candidate instead of always taking the first hit", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("openlibrary.org/search.json")) {
        return mockJsonResponse({
          docs: [
            {
              title: "Completely Different Book",
              author_name: ["Someone Else"],
              cover_i: 101,
              first_sentence: "Not related"
            },
            {
              title: "The Exact Match",
              author_name: ["Alice Author"]
            }
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataWithFallback("The Exact Match", "Alice Author");

    expect(result).toEqual({
      source: "OPEN_LIBRARY",
      title: "The Exact Match",
      author: "Alice Author"
    });
  });

  it("returns NONE when all providers are disabled", async () => {
    settings.set("metadata_provider_enabled", {
      open_library: false,
      amazon: false,
      bol: false,
      google: false,
      hardcover: false,
      goodreads: false,
      douban: false
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchMetadataWithFallback("Some Title", "Some Author");

    expect(result).toEqual({ source: "NONE" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not merge description from a wrong-book provider", async () => {
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
                description: "Looks richer but is the wrong book"
              }
            }
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataWithFallback("The Exact Match", "Alice Author");

    expect(result.description).toBeUndefined();
  });
});
