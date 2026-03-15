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

describe("metadata service fallback merge", () => {
  beforeEach(() => {
    settings.clear();
    vi.restoreAllMocks();
  });

  it("does not merge author or description from a weak provider match", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("openlibrary.org/search.json")) {
        return mockJsonResponse({
          docs: [{ title: "Some Title" }]
        });
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
        return mockJsonResponse({
          docs: [{ title: "Some Title" }]
        });
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

  it("fetches bol metadata from search and detail pages", async () => {
    settings.set("metadata_provider_enabled", {
      open_library: false,
      amazon: false,
      bol: true,
      google: false,
      hardcover: false,
      goodreads: false,
      douban: false
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("www.bol.com/nl/nl/s/?")) {
        return new Response(
          `
            <a href="/nl/nl/p/bertha/9300000048091098/">Wrong result</a>
            <a href="/nl/nl/p/ik-blijf-altijd-bij-jou-1-ik-blijf-altijd-bij-jou/9200000124410513/">Right result</a>
          `,
          { status: 200, headers: { "content-type": "text/html" } }
        );
      }

      if (url.includes("/nl/nl/p/bertha/9300000048091098/")) {
        return new Response(
          `
            <script type="application/ld+json">
              {
                "@type": ["Book", "Product"],
                "name": "Bertha",
                "author": { "name": "Wrong Author" },
                "description": "Wrong book",
                "image": { "url": "https://media.s-bol.com/wrong.jpg" }
              }
            </script>
          `,
          { status: 200, headers: { "content-type": "text/html" } }
        );
      }

      if (url.includes("/nl/nl/p/ik-blijf-altijd-bij-jou-1-ik-blijf-altijd-bij-jou/9200000124410513/")) {
        return new Response(
          `
            <script type="application/ld+json">
              {
                "@type": ["Book", "Product"],
                "name": "Ik blijf altijd bij jou 1 - Ik blijf altijd bij jou",
                "description": "<p>Prentenboek over vriendschap.</p>",
                "image": { "url": "https://media.s-bol.com/right.jpg" },
                "author": { "name": "Smriti Halls" },
                "workExample": [
                  {
                    "url": "https://www.bol.com/nl/nl/p/ik-blijf-altijd-bij-jou-1-ik-blijf-altijd-bij-jou/9200000124410513/",
                    "name": "Ik blijf altijd bij jou 1 - Ik blijf altijd bij jou"
                  }
                ]
              }
            </script>
            <span>Auteur:</span><a>Smriti Halls</a>
            <span>Serie:</span><a>Ik blijf altijd bij jou</a>
          `,
          { status: 200, headers: { "content-type": "text/html" } }
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataWithFallback(
      "Ik blijf altijd bij jou",
      "Smriti Halls"
    );

    expect(result).toEqual({
      source: "BOL",
      title: "Ik blijf altijd bij jou",
      author: "Smriti Halls",
      series: "Ik blijf altijd bij jou",
      description: "Prentenboek over vriendschap.",
      coverPath: "https://media.s-bol.com/right.jpg"
    });
  });

  it("extracts bol series from title prefixes when needed", async () => {
    settings.set("metadata_provider_enabled", {
      open_library: false,
      amazon: false,
      bol: true,
      google: false,
      hardcover: false,
      goodreads: false,
      douban: false
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("www.bol.com/nl/nl/s/?")) {
        return new Response(
          `<a href="/nl/nl/p/the-empyrean-fourth-wing/9300000140852675/">Fourth Wing</a>`,
          { status: 200, headers: { "content-type": "text/html" } }
        );
      }

      if (url.includes("/nl/nl/p/the-empyrean-fourth-wing/9300000140852675/")) {
        return new Response(
          `
            <script type="application/ld+json">
              {
                "@type": ["Book", "Product"],
                "name": "The Empyrean 1 - Fourth Wing",
                "description": "<p>Dragon rider fantasy.</p>",
                "image": { "url": "https://media.s-bol.com/fourth-wing.jpg" },
                "author": { "name": "Rebecca Yarros" }
              }
            </script>
            <span>Auteur:</span><a>Rebecca Yarros</a>
          `,
          { status: 200, headers: { "content-type": "text/html" } }
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataWithFallback("Fourth Wing", "Rebecca Yarros");

    expect(result).toMatchObject({
      source: "BOL",
      title: "Fourth Wing",
      author: "Rebecca Yarros",
      series: "The Empyrean #1",
      description: "Dragon rider fantasy.",
      coverPath: "https://media.s-bol.com/fourth-wing.jpg"
    });
  });

  it("does not call OpenRouter when model is empty even if AI is enabled", async () => {
    settings.set("metadata_openrouter_enabled", true);
    settings.set("metadata_openrouter_api_key", "test-key");
    settings.set("metadata_openrouter_model", "");

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("openrouter.ai")) {
        throw new Error("OpenRouter should not be called when model is empty");
      }

      if (url.includes("openlibrary.org/search.json")) {
        return mockJsonResponse({
          docs: [{ title: "Some Title", author_name: ["Some Author"] }]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchMetadataWithFallback("Some Title", "Some Author");

    expect(result).toEqual({
      source: "OPEN_LIBRARY",
      title: "Some Title",
      author: "Some Author"
    });
  });
});
