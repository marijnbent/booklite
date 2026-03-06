import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, unknown>();

vi.mock("../src/db/client", () => ({
  getSetting: vi.fn(async (key: string, fallback: unknown) =>
    settings.has(key) ? settings.get(key) : fallback
  )
}));

vi.mock("../src/config", () => ({
  config: {
    openrouterApiKey: "",
    openrouterModel: "google/gemini-2.0-flash-lite-001"
  }
}));

import { filenameToBasicMetadata } from "../src/services/books";
import { resolveFilenameMetadata } from "../src/services/filenameNormalizer";

const openRouterResponse = (content: string): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content } }]
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );

describe("filename normalizer", () => {
  beforeEach(() => {
    settings.clear();
    vi.restoreAllMocks();
  });

  it("does not call LLM for high-confidence parses", async () => {
    settings.set("metadata_openrouter_enabled", true);
    settings.set("metadata_openrouter_api_key", "key");
    settings.set("metadata_openrouter_model", "google/gemini-2.0-flash-lite-001");

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fileName = "Brandon Sanderson - Mistborn.epub";

    const result = await resolveFilenameMetadata(fileName);

    expect(result).toEqual(filenameToBasicMetadata(fileName));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not call LLM when parse is low-confidence but AI is disabled", async () => {
    settings.set("metadata_openrouter_enabled", false);
    settings.set("metadata_openrouter_api_key", "key");
    settings.set("metadata_openrouter_model", "google/gemini-2.0-flash-lite-001");

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fileName = "libgen_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.epub";

    const result = await resolveFilenameMetadata(fileName);

    expect(result).toEqual(filenameToBasicMetadata(fileName));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls LLM for low-confidence parses and merges corrections", async () => {
    settings.set("metadata_openrouter_enabled", true);
    settings.set("metadata_openrouter_api_key", "key");
    settings.set("metadata_openrouter_model", "google/gemini-2.0-flash-lite-001");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (!url.includes("openrouter.ai")) {
        throw new Error(`Unexpected URL: ${url}`);
      }

      return openRouterResponse(
        JSON.stringify({
          title: "Fourth Wing",
          author: "Rebecca Yarros",
          series: "The Empyrean, Book 1"
        })
      );
    });

    const result = await resolveFilenameMetadata("libgen_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.epub");

    expect(result).toEqual({
      title: "Fourth Wing",
      author: "Rebecca Yarros",
      series: "The Empyrean #1"
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to deterministic parse when LLM response is invalid", async () => {
    settings.set("metadata_openrouter_enabled", true);
    settings.set("metadata_openrouter_api_key", "key");
    settings.set("metadata_openrouter_model", "google/gemini-2.0-flash-lite-001");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(openRouterResponse("not-json"));

    const fileName = "libgen_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.epub";
    const result = await resolveFilenameMetadata(fileName);

    expect(result).toEqual(filenameToBasicMetadata(fileName));
  });

  it("does not call LLM when model is empty", async () => {
    settings.set("metadata_openrouter_enabled", true);
    settings.set("metadata_openrouter_api_key", "key");
    settings.set("metadata_openrouter_model", "");

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fileName = "libgen_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.epub";

    const result = await resolveFilenameMetadata(fileName);

    expect(result).toEqual(filenameToBasicMetadata(fileName));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps deterministic author and series when LLM returns only title", async () => {
    settings.set("metadata_openrouter_enabled", true);
    settings.set("metadata_openrouter_api_key", "key");
    settings.set("metadata_openrouter_model", "google/gemini-2.0-flash-lite-001");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      openRouterResponse(
        JSON.stringify({
          title: "Fourth Wing"
        })
      )
    );

    const fileName = "(The Empyrean 1) Rebecca Yarros - Fourth Wing libgen.epub";
    const deterministic = filenameToBasicMetadata(fileName);

    const result = await resolveFilenameMetadata(fileName);

    expect(result).toEqual({
      title: "Fourth Wing",
      author: deterministic.author,
      series: deterministic.series
    });
  });

  it("includes language-preservation instructions in the LLM prompt", async () => {
    settings.set("metadata_openrouter_enabled", true);
    settings.set("metadata_openrouter_api_key", "key");
    settings.set("metadata_openrouter_model", "google/gemini-2.0-flash-lite-001");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          messages?: Array<{ content?: string }>;
        };
        const systemMessage = body.messages?.[0]?.content ?? "";

        expect(systemMessage).toContain("Keep output in the same language/script as the raw filename.");
        expect(systemMessage).toContain("Never translate fields into a different language.");
        expect(systemMessage).toContain(
          "Preserve accents/diacritics and non-Latin characters from the filename when they are clear."
        );

        return openRouterResponse(
          JSON.stringify({
            title: "Het achtste leven"
          })
        );
      }
    );

    const result = await resolveFilenameMetadata("libgen_Het_achtste_leven_2014.epub");

    expect(result.title).toBe("Het achtste leven");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
