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

describe("metadata openrouter guardrails", () => {
  beforeEach(() => {
    settings.clear();
    vi.restoreAllMocks();
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
