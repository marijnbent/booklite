import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }])
}));

import { safeRemoteFetch } from "../src/services/safeRemoteFetch";
import { resolveContainedPath } from "../src/utils/containedPath";
import { redactRequestUrl } from "../src/utils/redactRequestUrl";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("security utilities", () => {
  it("redacts bearer query values and Kobo path credentials", () => {
    expect(redactRequestUrl("/api/v1/books/1/cover?token=secret&v=1")).toBe(
      "/api/v1/books/1/cover?token=***&v=1"
    );
    expect(redactRequestUrl("/api/kobo/device-secret/v1/library/sync")).toBe(
      "/api/kobo/***/v1/library/sync"
    );
  });

  it("rejects a public URL that redirects to a private address", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeRemoteFetch("https://covers.example/book.jpg")).rejects.toThrow(
      "private address"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects lexical and symbolic-link escapes from a data directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "booklite-contained-root-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "booklite-contained-outside-"));
    const insideFile = path.join(root, "book.epub");
    const outsideFile = path.join(outside, "secret.epub");
    const link = path.join(root, "linked.epub");
    fs.writeFileSync(insideFile, "book");
    fs.writeFileSync(outsideFile, "secret");
    fs.symlinkSync(outsideFile, link);

    try {
      expect(resolveContainedPath(root, "book.epub")).toBe(fs.realpathSync(insideFile));
      expect(() => resolveContainedPath(root, "../secret.epub")).toThrow("escapes");
      expect(() => resolveContainedPath(root, "linked.epub")).toThrow("escapes");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
