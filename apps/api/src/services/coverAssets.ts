import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "../config";
import { safeRemoteFetch } from "./safeRemoteFetch";

const MANAGED_COVER_PREFIX = "managed://covers/";
const MANAGED_COVER_PATTERN = /^managed:\/\/covers\/(\d+)\/cover\.jpg$/;
const FETCH_TIMEOUT_MS = 5000;
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const OUTPUT_QUALITY = 82;
const OUTPUT_MAX_WIDTH = 1400;

const normalizeCandidate = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getManagedCoverAbsolutePath = (bookId: number): string =>
  path.join(config.appDataDir, "covers", String(bookId), "cover.jpg");

const ensureCoverDir = (bookId: number): void => {
  fs.mkdirSync(path.dirname(getManagedCoverAbsolutePath(bookId)), { recursive: true });
};

const readResponseBytes = async (response: Response): Promise<Buffer> => {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) {
      throw new Error("Cover image is too large");
    }
    return bytes;
  }

  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_DOWNLOAD_BYTES) {
      throw new Error("Cover image is too large");
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
};

const normalizeToManagedJpeg = async (bytes: Buffer): Promise<Buffer> =>
  sharp(bytes, { limitInputPixels: 10000 * 10000 })
    .rotate()
    .resize({ width: OUTPUT_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: OUTPUT_QUALITY, mozjpeg: true })
    .toBuffer();

export const getManagedCoverReference = (bookId: number): string =>
  `${MANAGED_COVER_PREFIX}${bookId}/cover.jpg`;

export const isManagedCoverReference = (value: string | null | undefined): value is string =>
  Boolean(normalizeCandidate(value) && MANAGED_COVER_PATTERN.test(normalizeCandidate(value)!));

export const isRemoteCoverUrl = (value: string | null | undefined): value is string => {
  const normalized = normalizeCandidate(value);
  return Boolean(normalized && (normalized.startsWith("http://") || normalized.startsWith("https://")));
};

export const isBookCoverApiUrl = (bookId: number, value: string | null | undefined): boolean => {
  const normalized = normalizeCandidate(value);
  if (!normalized) return false;

  const expectedPath = `/api/v1/books/${bookId}/cover`;

  if (normalized.startsWith("/")) {
    try {
      const parsed = new URL(normalized, "http://booklite.local");
      return parsed.pathname === expectedPath;
    } catch {
      return false;
    }
  }

  try {
    const parsed = new URL(normalized);
    const base = new URL(config.baseUrl);
    return parsed.origin === base.origin && parsed.pathname === expectedPath;
  } catch {
    return false;
  }
};

export const resolveManagedCoverPath = (
  coverPath: string | null | undefined
): { bookId: number; absolutePath: string } | null => {
  const normalized = normalizeCandidate(coverPath);
  if (!normalized) return null;

  const match = MANAGED_COVER_PATTERN.exec(normalized);
  if (!match) return null;

  const bookId = Number.parseInt(match[1], 10);
  if (!Number.isFinite(bookId)) return null;

  return {
    bookId,
    absolutePath: getManagedCoverAbsolutePath(bookId)
  };
};

export const deleteManagedCoverIfPresent = (coverPath: string | null | undefined): void => {
  const resolved = resolveManagedCoverPath(coverPath);
  if (!resolved) return;

  try {
    fs.rmSync(resolved.absolutePath, { force: true });
    const coverDir = path.dirname(resolved.absolutePath);
    if (fs.existsSync(coverDir) && fs.readdirSync(coverDir).length === 0) {
      fs.rmdirSync(coverDir);
    }
  } catch {
    // Best-effort cleanup only.
  }
};

export const serializeBookCoverPath = (
  bookId: number,
  coverPath: string | null | undefined,
  updatedAt: string
): string | null => {
  const normalized = normalizeCandidate(coverPath);
  if (!normalized) return null;
  if (!isManagedCoverReference(normalized)) return normalized;
  return `/api/v1/books/${bookId}/cover?v=${encodeURIComponent(updatedAt)}`;
};

export const resolveStoredCoverPathForWrite = async (input: {
  bookId: number;
  coverPath: string | null;
  currentStoredCoverPath: string | null;
}): Promise<string | null> => {
  const normalized = normalizeCandidate(input.coverPath);
  if (!normalized) return null;

  if (isBookCoverApiUrl(input.bookId, normalized)) {
    return input.currentStoredCoverPath;
  }

  if (isManagedCoverReference(normalized)) {
    return normalized;
  }

  if (isRemoteCoverUrl(normalized)) {
    return localizeRemoteCoverForBook(input.bookId, normalized);
  }

  return normalized;
};

export const localizeRemoteCoverForBook = async (
  bookId: number,
  remoteUrl: string
): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await safeRemoteFetch(remoteUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Cover host returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("image/")) {
      throw new Error("Cover URL did not return an image");
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const parsedLength = Number.parseInt(contentLength, 10);
      if (Number.isFinite(parsedLength) && parsedLength > MAX_DOWNLOAD_BYTES) {
        throw new Error("Cover image is too large");
      }
    }

    const bytes = await readResponseBytes(response);
    if (bytes.length === 0) {
      throw new Error("Cover image response was empty");
    }

    const normalizedJpeg = await normalizeToManagedJpeg(bytes);
    ensureCoverDir(bookId);
    fs.writeFileSync(getManagedCoverAbsolutePath(bookId), normalizedJpeg);
    return getManagedCoverReference(bookId);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Cover image request timed out");
    }
    throw error instanceof Error ? error : new Error("Failed to fetch cover image");
  } finally {
    clearTimeout(timeout);
  }
};
