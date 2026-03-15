import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempEnv, setupOwnerAndLogin, setupTestApp } from "./helpers";

const { fetchMetadataPreviewMock, resolveFilenameMetadataMock } = vi.hoisted(() => ({
  fetchMetadataPreviewMock: vi.fn(),
  resolveFilenameMetadataMock: vi.fn()
}));

vi.mock("../src/services/metadata", () => ({
  fetchMetadataPreview: fetchMetadataPreviewMock
}));

vi.mock("../src/services/filenameNormalizer", () => ({
  resolveFilenameMetadata: resolveFilenameMetadataMock
}));

createTempEnv();

let app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>;
let accessToken = "";

describe("metadata preview route", () => {
  beforeAll(async () => {
    app = await setupTestApp();
    accessToken = (await setupOwnerAndLogin(app, "owner-preview@example.com", "owner-preview"))
      .accessToken;
  });

  beforeEach(() => {
    fetchMetadataPreviewMock.mockReset();
    resolveFilenameMetadataMock.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it("derives preview query fields from filename metadata when title is omitted", async () => {
    resolveFilenameMetadataMock.mockResolvedValue({
      title: "Bitch a revolutionary guide to sex, evoluation and the",
      author: "Lucy Cooke",
      series: "London #2022"
    });

    fetchMetadataPreviewMock.mockResolvedValue({
      source: "HARDCOVER",
      title: "Bitch: A Revolutionary Guide to Sex, Evolution and the Female Animal",
      author: "Lucy Cooke",
      series: undefined,
      description: "Preview description",
      coverPath: "https://example.test/cover.jpg",
      coverOptions: [{ coverPath: "https://example.test/cover.jpg", source: "HARDCOVER" }]
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/metadata/preview",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        fileName:
          "Bitch _ a revolutionary guide to sex, evoluation and the -- Cooke, Lucy -- London, 2022 -- Doubleday Books -- 9780857524126 -- Anna's Archive.epub"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(resolveFilenameMetadataMock).toHaveBeenCalledWith(
      "Bitch _ a revolutionary guide to sex, evoluation and the -- Cooke, Lucy -- London, 2022 -- Doubleday Books -- 9780857524126 -- Anna's Archive.epub"
    );
    expect(fetchMetadataPreviewMock).toHaveBeenCalledWith(
      "Bitch a revolutionary guide to sex, evoluation and the",
      "Lucy Cooke"
    );
    expect(response.json()).toEqual({
      source: "HARDCOVER",
      queryTitle: "Bitch a revolutionary guide to sex, evoluation and the",
      queryAuthor: "Lucy Cooke",
      querySeries: "London #2022",
      title: "Bitch: A Revolutionary Guide to Sex, Evolution and the Female Animal",
      author: "Lucy Cooke",
      series: undefined,
      description: "Preview description",
      coverPath: "https://example.test/cover.jpg",
      coverOptions: [{ coverPath: "https://example.test/cover.jpg", source: "HARDCOVER" }]
    });
  });

  it("prefers explicit title and author over filename-derived values", async () => {
    resolveFilenameMetadataMock.mockResolvedValue({
      title: "Filename Title",
      author: "Filename Author",
      series: "Filename Series #1"
    });

    fetchMetadataPreviewMock.mockResolvedValue({
      source: "GOOGLE",
      title: "Edited Title",
      author: "Edited Author",
      series: "Resolved Series #2",
      description: undefined,
      coverPath: undefined,
      coverOptions: []
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/metadata/preview",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        fileName: "Ignored.epub",
        title: "Edited Title",
        author: "Edited Author"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMetadataPreviewMock).toHaveBeenCalledWith("Edited Title", "Edited Author");
    expect(response.json()).toMatchObject({
      queryTitle: "Edited Title",
      queryAuthor: "Edited Author",
      querySeries: "Filename Series #1",
      source: "GOOGLE"
    });
  });

  it("returns normalized query fields even when providers return NONE", async () => {
    resolveFilenameMetadataMock.mockResolvedValue({
      title: "Normalized Title",
      author: "Normalized Author",
      series: null
    });

    fetchMetadataPreviewMock.mockResolvedValue({
      source: "NONE",
      coverOptions: []
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/metadata/preview",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        fileName: "Noisy Upload.epub"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      source: "NONE",
      queryTitle: "Normalized Title",
      queryAuthor: "Normalized Author",
      coverOptions: []
    });
  });
});
