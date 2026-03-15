import path from "node:path";

const supportedBookExts = ["epub", "kepub", "pdf"] as const;
const koboSyncableBookExts = ["epub", "kepub"] as const;

export const isSupportedBookExt = (ext: string): boolean =>
  supportedBookExts.includes(ext.toLowerCase() as (typeof supportedBookExts)[number]);

export const isKoboSyncableBookExt = (ext: string): boolean =>
  koboSyncableBookExts.includes(ext.toLowerCase() as (typeof koboSyncableBookExts)[number]);

export interface ParsedFilename {
  title: string;
  author: string | null;
  series: string | null;
}

// --- Source tag patterns ---

const SOURCE_TAGS = [
  /\s*\(z-lib\.org\)\s*/gi,
  /\s*\(Z-Library\)\s*/gi,
  /\s*[-–—]\s*libgen\.li\s*/gi,
  /\s*--\s*Anna'?s Archive\s*/gi
];

const HASH_PATTERN = /\b[0-9a-f]{32,}\b/gi;
const ISBN_PATTERN = /\b(?:97[89])?\d{10}\b/g;
const TRAILING_TAG_PATTERN =
  /\s*[\[(](?:epub|kepub|pdf|mobi|azw3|fb2|cbz|cbr|ebook|audiobook|retail|scan|ocr|v\d+|rev\d+)[\])]\s*$/i;
const YEAR_PUBLISHER_PATTERN = /\s*\((?:(?:19|20)\d{2}(?:-\d{2}(?:-\d{2})?)?)?(?:,\s*[^)]+)?\)\s*$/;
const TRAILING_YEAR_PATTERN = /\s*[\[(](?:19|20)\d{2}[\])]\s*$/;

// --- Series patterns ---

// Matches "[Series Name NN]" or "(Series Name NN)" inline in a title
const BRACKET_SERIES_IN_TITLE = /\[([^\]]+?)\s+(\d{1,3})\]\s*/;
const PAREN_SERIES_IN_TITLE = /\(([^)]+?)\s*#\s*(\d+(?:\.\d+)?)\)/;
// "Series, Book N" pattern
const SERIES_BOOK_PATTERN = /\(([^)]+?),\s*Book\s+(\d+(?:\.\d+)?)\)/i;
// Trailing "#N" at end of string: "Title - Subtitle #1"
const TRAILING_HASH_NUM = /\s*#(\d+(?:\.\d+)?)\s*$/;

// Series prefix: "(Series Name N)" or "[Series Name N]" at start of filename
// Requires a number to distinguish from "[Author Name]" bracket patterns
const SERIES_PREFIX_PATTERN = /^[\[(](.+?)\s+(\d+(?:\.\d+)?)\s*[\])]\s*/;

// --- Utility functions ---

const cleanSegment = (value: string): string =>
  value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, "")
    .trim();

const cleanTitle = (value: string): string =>
  cleanSegment(value).replace(/^\d+\s*[-:]\s*/, "").trim();

const COMMON_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for",
  "with", "by", "from", "its", "it", "is", "was", "are", "be", "not",
  "no", "us", "we", "my", "all", "how", "why", "what", "who", "when",
  "this", "that", "them", "they", "your", "his", "her", "our", "into"
]);

const isLikelyAuthor = (value: string): boolean => {
  const cleaned = cleanSegment(value);
  if (!cleaned) return false;
  if (cleaned.length > 80) return false;
  if (/\d/.test(cleaned)) return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  return /[A-Za-z]/.test(cleaned);
};

/** Score how "name-like" a string is (0-1). Higher = more likely an author name. */
const authorLikelihood = (value: string): number => {
  const cleaned = cleanSegment(value);
  if (!cleaned) return 0;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  let score = 0;

  // 2-3 words is ideal for a name
  if (words.length >= 2 && words.length <= 3) score += 0.4;
  else if (words.length === 1 || words.length === 4) score += 0.2;

  // Names have capitalized words, not common English words
  const commonCount = words.filter((w) => COMMON_WORDS.has(w.toLowerCase())).length;
  score += Math.max(0, 0.3 * (1 - commonCount / words.length));

  // Names contain periods or dots (initials like J.R.R.)
  if (/[A-Z]\./.test(cleaned)) score += 0.15;

  // Contains comma (Last, First format)
  if (/,/.test(cleaned)) score += 0.15;

  return score;
};

const normalizeAuthor = (value: string): string => {
  const cleaned = cleanSegment(value);
  // Handle "Last, First" or "Last, First M." format
  const parts = cleaned.split(/,\s*/);
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    const last = parts[0].trim();
    const first = parts[1].trim();
    if (last.length < 40 && first.length < 40 && !/\d/.test(last) && !/\d/.test(first)) {
      return `${first} ${last}`;
    }
  }
  return cleaned;
};

const annasUnderscore = (value: string): string =>
  value.replace(/_/g, " ").replace(/\s+/g, " ").trim();

const stripSourceTags = (value: string): string => {
  let result = value;
  for (const pattern of SOURCE_TAGS) {
    result = result.replace(pattern, "");
  }
  return result.trim();
};

const stripHashes = (value: string): string =>
  value.replace(HASH_PATTERN, "").replace(/\s+/g, " ").trim();

const stripISBNs = (value: string): string =>
  value.replace(ISBN_PATTERN, "").replace(/\s+/g, " ").trim();

const stripTrailingNoise = (value: string): string => {
  let current = value.trim();
  for (let i = 0; i < 5; i++) {
    const stripped = current
      .replace(TRAILING_TAG_PATTERN, "")
      .replace(TRAILING_YEAR_PATTERN, "")
      .replace(YEAR_PUBLISHER_PATTERN, "")
      .trim();
    if (stripped === current) return stripped;
    current = stripped;
  }
  return current;
};

const extractSeries = (
  title: string
): { title: string; series: string | null } => {
  // "(Series Name #4)" in title
  const parenMatch = title.match(PAREN_SERIES_IN_TITLE);
  if (parenMatch) {
    const seriesName = cleanSegment(parenMatch[1]);
    const cleaned = cleanSegment(title.replace(PAREN_SERIES_IN_TITLE, " "));
    if (cleaned) {
      return { title: cleaned, series: `${seriesName} #${parenMatch[2]}` };
    }
  }

  // "(Series, Book N)" in title
  const bookMatch = title.match(SERIES_BOOK_PATTERN);
  if (bookMatch) {
    const seriesName = cleanSegment(bookMatch[1]);
    const cleaned = cleanSegment(title.replace(SERIES_BOOK_PATTERN, " "));
    if (cleaned) {
      return { title: cleaned, series: `${seriesName} #${bookMatch[2]}` };
    }
  }

  // "[Series Name NN]" inline in title
  const bracketMatch = title.match(BRACKET_SERIES_IN_TITLE);
  if (bracketMatch) {
    const seriesName = cleanSegment(bracketMatch[1]);
    const cleaned = cleanSegment(title.replace(BRACKET_SERIES_IN_TITLE, " "));
    if (cleaned) {
      return { title: cleaned, series: `${seriesName} #${bracketMatch[2]}` };
    }
  }

  // Trailing "#N" — try to derive series name from subtitle portion
  const trailingMatch = title.match(TRAILING_HASH_NUM);
  if (trailingMatch) {
    const withoutNum = title.replace(TRAILING_HASH_NUM, "").trim();
    // If there's a dash, the part after the dash is the series name
    const dashParts = withoutNum.match(/^(.+?)\s*[-–—]\s+(.+)$/);
    if (dashParts) {
      return {
        title: cleanSegment(dashParts[1]),
        series: `${cleanSegment(dashParts[2])} #${trailingMatch[1]}`
      };
    }
    // Otherwise just strip the number
    return { title: withoutNum, series: null };
  }

  return { title, series: null };
};

const extractSeriesPrefix = (
  value: string
): { remainder: string; series: string | null } => {
  const prefixMatch = value.match(SERIES_PREFIX_PATTERN);
  if (!prefixMatch) return { remainder: value, series: null };

  const seriesName = cleanSegment(prefixMatch[1]);
  const seriesNum = prefixMatch[2];
  return {
    remainder: value.slice(prefixMatch[0].length).trim(),
    series: `${seriesName} #${seriesNum}`
  };
};

// --- Format-specific parsers ---

const parseAnnasArchive = (baseName: string): ParsedFilename | null => {
  if (!baseName.includes(" -- ")) return null;

  const segments = baseName.split(/\s+--\s+/).map((s) => s.trim());
  if (segments.length < 2) return null;

  // First segment is title (may contain series suffix or subtitle)
  let rawTitle = annasUnderscore(segments[0]);

  // Second segment is author (may contain "[Alt Name]")
  let rawAuthor = annasUnderscore(
    segments[1].replace(/\[.*?\]/g, "").trim()
  );

  // Extract series from title
  let series: string | null = null;
  const seriesExtracted = extractSeries(rawTitle);
  rawTitle = seriesExtracted.title;
  series = seriesExtracted.series;

  // If no series from title, check the third segment
  if (!series && segments.length >= 3) {
    const thirdSeg = segments[2].trim();

    // "Crossfire #1, 2012" — series with year
    const seriesYearMatch = thirdSeg.match(
      /^(.+?#\d+(?:\.\d+)?)\s*,\s*(?:19|20)\d{2}$/
    );
    if (seriesYearMatch) {
      series = cleanSegment(seriesYearMatch[1]);
    } else {
      // "Rose Hill, 1, 1, 2024" — series name, number, edition, year
      const annasSeriesMatch = thirdSeg.match(
        /^([^,]+?),\s*(\d+)\s*(?:,\s*\d+)?\s*(?:,\s*(?:19|20)\d{2})?$/
      );
      if (annasSeriesMatch) {
        series = `${cleanSegment(annasSeriesMatch[1])} #${annasSeriesMatch[2]}`;
      }
    }
  }

  if (!rawTitle && !rawAuthor) return null;

  return {
    title: cleanTitle(rawTitle) || rawTitle,
    author: rawAuthor ? normalizeAuthor(rawAuthor) : null,
    series
  };
};

const parseZLib = (baseName: string): ParsedFilename | null => {
  if (!/\(z-lib\.org\)/i.test(baseName) && !/\(Z-Library\)/i.test(baseName)) {
    return null;
  }

  let cleaned = baseName
    .replace(/\s*\(z-lib\.org\)\s*/gi, "")
    .replace(/\s*\(Z-Library\)\s*/gi, "")
    .trim();

  // Find the last parenthesized group — that should be the author
  const authorMatch = cleaned.match(/^(.+)\(([^)]+)\)\s*$/);
  if (!authorMatch) return null;

  let rawTitle = authorMatch[1].trim();
  const rawAuthor = authorMatch[2].trim();

  let series: string | null = null;

  // "Title - Series, Book N"
  const dashSeriesMatch = rawTitle.match(/^(.+?)\s*[-–—]\s+(.+?,\s*Book\s+\d+(?:\.\d+)?)\s*$/i);
  if (dashSeriesMatch) {
    rawTitle = dashSeriesMatch[1].trim();
    const seriesPart = dashSeriesMatch[2].trim();
    const bookMatch = seriesPart.match(/^(.+?),\s*Book\s+(\d+(?:\.\d+)?)\s*$/i);
    if (bookMatch) {
      series = `${cleanSegment(bookMatch[1])} #${bookMatch[2]}`;
    } else {
      series = cleanSegment(seriesPart);
    }
  }

  if (!series) {
    const extracted = extractSeries(rawTitle);
    rawTitle = extracted.title;
    series = extracted.series;
  }

  rawTitle = rawTitle.replace(/[-–—]+\s*$/, "").trim();

  if (!rawTitle) return null;

  return {
    title: cleanTitle(rawTitle),
    author: isLikelyAuthor(rawAuthor) ? normalizeAuthor(rawAuthor) : null,
    series
  };
};

const parseLibgen = (baseName: string): ParsedFilename | null => {
  if (!/[-–—]\s*libgen\.li\s*$/i.test(baseName)) return null;

  let cleaned = baseName.replace(/\s*[-–—]\s*libgen\.li\s*$/i, "").trim();
  cleaned = cleaned.replace(YEAR_PUBLISHER_PATTERN, "").trim();

  // Check for series prefix at start: "[Series N] Author - Title"
  const { remainder, series: prefixSeries } = extractSeriesPrefix(cleaned);
  if (prefixSeries) {
    cleaned = remainder;
  }

  const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s+(.+)$/);
  if (!dashMatch) return null;

  const left = cleanSegment(dashMatch[1]);
  const right = cleanSegment(dashMatch[2]);

  // In libgen format, author is on the left
  const extracted = extractSeries(right);

  return {
    title: cleanTitle(extracted.title),
    author: left ? normalizeAuthor(left) : null,
    series: prefixSeries ?? extracted.series
  };
};

const parseSeriesPrefix = (
  baseName: string
): ParsedFilename | null => {
  const prefixMatch = baseName.match(SERIES_PREFIX_PATTERN);
  if (!prefixMatch) return null;

  const seriesName = cleanSegment(prefixMatch[1]);
  const seriesNum = prefixMatch[2];
  const series = `${seriesName} #${seriesNum}`;
  const remainder = baseName.slice(prefixMatch[0].length).trim();

  if (!remainder) return null;

  let cleaned = stripSourceTags(remainder);
  cleaned = stripTrailingNoise(cleaned);
  cleaned = stripHashes(cleaned);
  cleaned = stripISBNs(cleaned);
  cleaned = cleanSegment(cleaned);

  const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s+(.+)$/);
  if (dashMatch) {
    const left = cleanSegment(dashMatch[1]);
    const right = cleanSegment(dashMatch[2]);

    if (isLikelyAuthor(left)) {
      return { title: cleanTitle(right), author: normalizeAuthor(left), series };
    }
    if (isLikelyAuthor(right)) {
      return { title: cleanTitle(left), author: normalizeAuthor(right), series };
    }
    return { title: cleanTitle(right), author: normalizeAuthor(left), series };
  }

  return { title: cleanTitle(cleaned), author: null, series };
};

const parseStandard = (normalized: string): ParsedFilename => {
  // [Author] Title — only when bracket content has no digits (otherwise it's a series tag)
  const bracketMatch = normalized.match(/^\[(.+?)\]\s+(.+)$/);
  if (bracketMatch) {
    const bracketContent = cleanSegment(bracketMatch[1]);
    if (isLikelyAuthor(bracketContent)) {
      const title = cleanTitle(bracketMatch[2]);
      if (title) {
        const extracted = extractSeries(title);
        return {
          author: normalizeAuthor(bracketContent),
          title: cleanTitle(extracted.title),
          series: extracted.series
        };
      }
    }
  }

  // Title by Author
  const byMatch = normalized.match(/^(.+?)\s+\bby\b\s+(.+)$/i);
  if (byMatch) {
    const title = cleanTitle(byMatch[1]);
    const author = cleanSegment(byMatch[2]);
    if (title && isLikelyAuthor(author)) {
      const extracted = extractSeries(title);
      return {
        title: cleanTitle(extracted.title),
        author: normalizeAuthor(author),
        series: extracted.series
      };
    }
  }

  // Author - Title or Title - Author
  const dashMatch = normalized.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    const left = cleanSegment(dashMatch[1]);
    const right = cleanSegment(dashMatch[2]);
    const leftAuthor = isLikelyAuthor(left);
    const rightAuthor = isLikelyAuthor(right);

    let author: string | null = null;
    let title: string;

    if (leftAuthor && !rightAuthor) {
      author = left;
      title = right;
    } else if (!leftAuthor && rightAuthor) {
      author = right;
      title = left;
    } else if (leftAuthor && rightAuthor) {
      const leftWords = left.split(/\s+/).length;
      const rightWords = right.split(/\s+/).length;
      // Use name-likelihood scoring to disambiguate
      if (authorLikelihood(left) >= authorLikelihood(right)) {
        author = left;
        title = right;
      } else {
        author = right;
        title = left;
      }
    } else {
      title = `${left} - ${right}`;
    }

    const extracted = extractSeries(cleanTitle(title));
    return {
      author: author ? normalizeAuthor(author) : null,
      title: cleanTitle(extracted.title),
      series: extracted.series
    };
  }

  // Fallback: just a title
  const extracted = extractSeries(cleanTitle(normalized));
  return {
    title: cleanTitle(extracted.title) || normalized,
    author: null,
    series: extracted.series
  };
};

export const filenameToBasicMetadata = (fileName: string): ParsedFilename => {
  const baseName = path.parse(fileName).name.trim();

  // 1. Anna's Archive format (double-dash separated)
  const annasResult = parseAnnasArchive(baseName);
  if (annasResult) return annasResult;

  // 2. z-lib format
  const zlibResult = parseZLib(baseName);
  if (zlibResult) return zlibResult;

  // 3. libgen format (check before series prefix since libgen files can have series prefixes)
  const libgenResult = parseLibgen(baseName);
  if (libgenResult) return libgenResult;

  // 4. Series prefix format "(Series N)" or "[Series N]" — requires a number
  const seriesPrefixResult = parseSeriesPrefix(baseName);
  if (seriesPrefixResult) return seriesPrefixResult;

  // 5. Standard format with general cleanup
  const dotNormalized = baseName.includes(" ")
    ? baseName
    : baseName.replace(/[.]+/g, " ");
  let normalized = dotNormalized.replace(/_/g, " ").replace(/\s+/g, " ");
  normalized = stripSourceTags(normalized);
  normalized = stripTrailingNoise(normalized);
  normalized = stripHashes(normalized);
  normalized = stripISBNs(normalized);
  normalized = cleanSegment(normalized);

  return parseStandard(normalized);
};
