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

describe("metadata service fallback merge", () => {
  beforeEach(() => {
    settings.clear();
    settings.set("metadata_provider_primary", "open_library");
    settings.set("metadata_provider_secondary", "google");
    settings.set("metadata_provider_tertiary", "none");
    settings.set("metadata_provider_fallback", "google");
    vi.restoreAllMocks();
  });

  it("merges partial metadata across providers using configured priority", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("openlibrary.org/search.json")) {
        return mockJsonResponse({
          docs: [{ title: "Open Title" }]
        });
      }

      if (url.includes("googleapis.com/books/v1/volumes")) {
        return mockJsonResponse({
          items: [
            {
              volumeInfo: {
                title: "Google Title",
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
      title: "Open Title",
      author: "Merged Author",
      description: "Merged Description",
      coverPath: "https://covers.example/cover.jpg"
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
                title: "Google Result",
                authors: ["Google Author"]
              }
            }
          ]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataWithFallback("Some Title", "Some Author");

    expect(result).toEqual({
      source: "GOOGLE",
      title: "Google Result",
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
});
