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

describe("metadata bol provider", () => {
  beforeEach(() => {
    settings.clear();
    vi.restoreAllMocks();
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
});
