import path from "node:path";

export const isSupportedBookExt = (ext: string): boolean =>
  ["epub", "pdf"].includes(ext.toLowerCase());

const TRAILING_TAG_PATTERN =
  /\s*[\[(](?:epub|pdf|mobi|azw3|fb2|cbz|cbr|ebook|audiobook|retail|scan|ocr|v\d+|rev\d+)[\])]\s*$/i;
const TRAILING_YEAR_PATTERN = /\s*[\[(](?:19|20)\d{2}[\])]\s*$/;
const BRACKET_AUTHOR_PATTERN = /^\[(.+?)\]\s+(.+)$/;
const BY_AUTHOR_PATTERN = /^(.+?)\s+\bby\b\s+(.+)$/i;
const DASH_SEPARATED_PATTERN = /^(.+?)\s*[-–—]\s*(.+)$/;

const stripTrailingNoise = (value: string): string => {
  let current = value.trim();
  while (current) {
    const stripped = current
      .replace(TRAILING_TAG_PATTERN, "")
      .replace(TRAILING_YEAR_PATTERN, "")
      .trim();
    if (stripped === current) return stripped;
    current = stripped;
  }
  return value.trim();
};

const cleanSegment = (value: string): string =>
  value
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, "")
    .trim();

const cleanTitle = (value: string): string =>
  cleanSegment(value).replace(/^\d+\s*[-:]\s*/, "").trim();

const isLikelyAuthor = (value: string): boolean => {
  const cleaned = cleanSegment(value);
  if (!cleaned) return false;
  if (cleaned.length > 80) return false;
  if (/\d/.test(cleaned)) return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  return /[A-Za-z]/.test(cleaned);
};

export const filenameToBasicMetadata = (
  fileName: string
): { title: string; author: string | null } => {
  const baseName = path.parse(fileName).name.trim();
  const dotNormalized = baseName.includes(" ")
    ? baseName
    : baseName.replace(/[.]+/g, " ");
  const normalized = stripTrailingNoise(
    dotNormalized.replace(/[_]+/g, " ").replace(/\s+/g, " ")
  );

  const bracketMatch = normalized.match(BRACKET_AUTHOR_PATTERN);
  if (bracketMatch) {
    const author = cleanSegment(bracketMatch[1]);
    const title = cleanTitle(bracketMatch[2]);
    if (author && title) return { author, title };
  }

  const byMatch = normalized.match(BY_AUTHOR_PATTERN);
  if (byMatch) {
    const title = cleanTitle(byMatch[1]);
    const author = cleanSegment(byMatch[2]);
    if (title && isLikelyAuthor(author)) return { title, author };
  }

  const dashMatch = normalized.match(DASH_SEPARATED_PATTERN);
  if (dashMatch) {
    const left = cleanSegment(dashMatch[1]);
    const right = cleanSegment(dashMatch[2]);
    const leftAuthor = isLikelyAuthor(left);
    const rightAuthor = isLikelyAuthor(right);

    if (leftAuthor && !rightAuthor) return { author: left, title: cleanTitle(right) };
    if (!leftAuthor && rightAuthor) return { author: right, title: cleanTitle(left) };
    if (leftAuthor && rightAuthor) {
      const leftWords = left.split(/\s+/).length;
      const rightWords = right.split(/\s+/).length;
      if (rightWords > leftWords) return { author: right, title: cleanTitle(left) };
      return { author: left, title: cleanTitle(right) };
    }
  }

  return {
    title: cleanTitle(normalized) || baseName || path.parse(fileName).name,
    author: null
  };
};
