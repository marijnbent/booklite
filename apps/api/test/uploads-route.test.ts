import path from "node:path";
import { describe, expect, it } from "vitest";
import { isSupportedBookExt } from "../src/services/books";
import { sanitizeFileName } from "../src/routes/uploads";

describe("upload filename sanitization", () => {
  it("preserves the epub extension when truncating long upload names", () => {
    const original =
      "Bitch _ a revolutionary guide to sex, evoluation and the -- Cooke, Lucy -- London, 2022 -- Doubleday Books (Transworld Publishers a division of the -- 9780857524126 -- ccd6506167f7d14bf6d5a13451255a32 -- Anna’s Archive.epub";

    const sanitized = sanitizeFileName(original);
    const fileExt = path.extname(sanitized).slice(1).toLowerCase();

    expect(sanitized.length).toBeLessThanOrEqual(200);
    expect(sanitized.endsWith(".epub")).toBe(true);
    expect(fileExt).toBe("epub");
    expect(isSupportedBookExt(fileExt)).toBe(true);
  });

  it("preserves the kepub extension when truncating long upload names", () => {
    const original = `${"a".repeat(220)}.kepub`;

    const sanitized = sanitizeFileName(original);

    expect(sanitized.length).toBeLessThanOrEqual(200);
    expect(sanitized.endsWith(".kepub")).toBe(true);
  });
});
