import { describe, it, expect } from "vitest";
import {
  createUploadBatches,
  toErrorMessage,
  sortDrafts,
  DEPLOYMENT_SAFE_UPLOAD_BATCH_BYTES,
  DEPLOYMENT_SAFE_UPLOAD_BATCH_FILES,
} from "../components/uploads/uploadHelpers";
import type { UploadDraft } from "../components/uploads/UploadDraftTypes";

function makeDraft(id: string, size: number, overrides: Partial<UploadDraft> = {}): UploadDraft {
  return {
    id,
    file: { size } as File,
    fileNameTitle: "test",
    title: "Test",
    author: "",
    series: "",
    description: "",
    coverPath: "",
    coverOptions: [],
    favorite: false,
    collectionIds: [],
    selected: false,
    metadataState: "idle",
    metadataSource: null,
    titleTouched: false,
    authorTouched: false,
    descriptionTouched: false,
    ...overrides,
  };
}

describe("toErrorMessage", () => {
  it("returns 'Upload failed' for non-Error values", () => {
    expect(toErrorMessage("not an Error")).toBe("Upload failed");
    expect(toErrorMessage(42)).toBe("Upload failed");
    expect(toErrorMessage(null)).toBe("Upload failed");
  });

  it("returns server-too-large message when message contains '413'", () => {
    const result = toErrorMessage(new Error("413"));
    expect(result.toLowerCase()).toContain("too large");
  });

  it("returns server-too-large message for 'request entity too large'", () => {
    const result = toErrorMessage(new Error("Request entity too large"));
    expect(result.toLowerCase()).toContain("too large");
  });

  it("extracts error field from JSON message", () => {
    const result = toErrorMessage(new Error(JSON.stringify({ error: "File too big" })));
    expect(result).toBe("File too big");
  });

  it("returns raw message for plain Error", () => {
    expect(toErrorMessage(new Error("Some message"))).toBe("Some message");
  });
});

describe("createUploadBatches", () => {
  it("returns [] for empty input", () => {
    expect(createUploadBatches([])).toEqual([]);
  });

  it("puts a single draft in one batch", () => {
    const drafts = [makeDraft("a", 100)];
    const batches = createUploadBatches(drafts);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
  });

  it(`splits into new batch after ${DEPLOYMENT_SAFE_UPLOAD_BATCH_FILES} files`, () => {
    const drafts = Array.from({ length: DEPLOYMENT_SAFE_UPLOAD_BATCH_FILES + 1 }, (_, i) =>
      makeDraft(String(i), 1)
    );
    const batches = createUploadBatches(drafts);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(DEPLOYMENT_SAFE_UPLOAD_BATCH_FILES);
    expect(batches[1]).toHaveLength(1);
  });

  it("splits into new batch when byte count exceeds DEPLOYMENT_SAFE_UPLOAD_BATCH_BYTES", () => {
    // Two drafts each just over half the byte limit → second one should go to new batch
    const halfPlus = Math.floor(DEPLOYMENT_SAFE_UPLOAD_BATCH_BYTES / 2) + 1;
    const drafts = [makeDraft("a", halfPlus), makeDraft("b", halfPlus)];
    const batches = createUploadBatches(drafts);
    expect(batches).toHaveLength(2);
  });

  it("starts a new batch when a single draft exactly meets byte limit", () => {
    const drafts = [
      makeDraft("a", DEPLOYMENT_SAFE_UPLOAD_BATCH_BYTES),
      makeDraft("b", 1),
    ];
    const batches = createUploadBatches(drafts);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(1);
    expect(batches[1]).toHaveLength(1);
  });
});

describe("sortDrafts", () => {
  it("puts drafts with error first", () => {
    const drafts = [
      makeDraft("a", 1, { metadataState: "enriched" }),
      makeDraft("b", 1, { metadataState: "none" }),
      makeDraft("c", 1, { error: "oops", metadataState: "idle" }),
    ];
    const sorted = sortDrafts(drafts);
    expect(sorted[0].id).toBe("c");
  });

  it("puts metadataState=none before metadataState=error", () => {
    const drafts = [
      makeDraft("a", 1, { metadataState: "error" }),
      makeDraft("b", 1, { metadataState: "none" }),
    ];
    const sorted = sortDrafts(drafts);
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("a");
  });

  it("puts error, none, error-state, then rest in correct order", () => {
    const drafts = [
      makeDraft("rest", 1, { metadataState: "enriched" }),
      makeDraft("meta-error", 1, { metadataState: "error" }),
      makeDraft("no-match", 1, { metadataState: "none" }),
      makeDraft("upload-error", 1, { error: "fail", metadataState: "idle" }),
    ];
    const sorted = sortDrafts(drafts);
    expect(sorted.map((d) => d.id)).toEqual(["upload-error", "no-match", "meta-error", "rest"]);
  });

  it("does not mutate the input array", () => {
    const drafts = [
      makeDraft("a", 1, { metadataState: "none" }),
      makeDraft("b", 1, { error: "fail" }),
    ];
    const original = [...drafts];
    sortDrafts(drafts);
    expect(drafts[0].id).toBe(original[0].id);
  });
});
