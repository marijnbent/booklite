import { describe, expect, it } from "vitest";
import { isKoboSyncableBookExt, isSupportedBookExt } from "../src/services/books";

describe("book format support", () => {
  it("accepts kepub uploads alongside epub and pdf", () => {
    expect(isSupportedBookExt("epub")).toBe(true);
    expect(isSupportedBookExt("kepub")).toBe(true);
    expect(isSupportedBookExt("pdf")).toBe(true);
  });

  it("treats kepub as Kobo-syncable", () => {
    expect(isKoboSyncableBookExt("epub")).toBe(true);
    expect(isKoboSyncableBookExt("kepub")).toBe(true);
    expect(isKoboSyncableBookExt("pdf")).toBe(false);
  });
});
