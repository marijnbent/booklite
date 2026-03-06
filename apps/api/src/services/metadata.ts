import { config } from "../config";
import { getSetting } from "../db/client";
import { callOpenRouterJsonObject } from "./openrouter";

export interface MetadataResult {
  title?: string;
  author?: string;
  series?: string;
  description?: string;
  coverPath?: string;
  source:
    | "OPEN_LIBRARY"
    | "AMAZON"
    | "GOOGLE"
    | "HARDCOVER"
    | "GOODREADS"
    | "DOUBAN"
    | "NONE";
}

type MetadataProvider =
  | "open_library"
  | "amazon"
  | "google"
  | "hardcover"
  | "goodreads"
  | "douban";

type MetadataProviderEnabled = Record<MetadataProvider, boolean>;

interface ProviderCandidate {
  provider: MetadataProvider;
  metadata: MetadataResult;
  titleScore: number;
  authorScore: number;
  completeness: number;
  trust: number;
  overallScore: number;
}

const providerPreference: MetadataProvider[] = [
  "open_library",
  "google",
  "goodreads",
  "hardcover",
  "amazon",
  "douban"
];

const providerTrustScore: Record<MetadataProvider, number> = {
  open_library: 1,
  google: 0.98,
  goodreads: 0.95,
  hardcover: 0.95,
  amazon: 0.92,
  douban: 0.9
};

const defaultProviderEnabled: MetadataProviderEnabled = {
  open_library: true,
  amazon: true,
  google: true,
  hardcover: false,
  goodreads: true,
  douban: false
};

const toProviderEnabled = (
  value: unknown,
  fallback: MetadataProviderEnabled
): MetadataProviderEnabled => {
  if (!value || typeof value !== "object") return fallback;
  const row = value as Record<string, unknown>;

  return {
    open_library:
      typeof row.open_library === "boolean" ? row.open_library : fallback.open_library,
    amazon: typeof row.amazon === "boolean" ? row.amazon : fallback.amazon,
    google: typeof row.google === "boolean" ? row.google : fallback.google,
    hardcover: typeof row.hardcover === "boolean" ? row.hardcover : fallback.hardcover,
    goodreads: typeof row.goodreads === "boolean" ? row.goodreads : fallback.goodreads,
    douban: typeof row.douban === "boolean" ? row.douban : fallback.douban
  };
};

const toQuery = (title: string, author?: string): string => {
  const parts = [title.trim()];
  if (author?.trim()) parts.push(author.trim());
  return parts.join(" ");
};

const normalizeUrl = (url: string): string => url.replace(/\\\//g, "/");

const absoluteUrl = (base: string, href: string): string =>
  href.startsWith("http") ? href : new URL(href, base).toString();

const cleanText = (value: string): string =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const stripTags = (value: string): string => cleanText(value.replace(/<[^>]*>/g, " "));

const normalizeForMatch = (value: string): string =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value: string): string[] =>
  normalizeForMatch(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

const diceCoefficient = (query: string, candidate: string): number => {
  const queryTokens = new Set(tokenize(query));
  const candidateTokens = new Set(tokenize(candidate));
  if (queryTokens.size === 0 || candidateTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) intersection += 1;
  }

  return (2 * intersection) / (queryTokens.size + candidateTokens.size);
};

const similarityScore = (query: string | undefined, candidate: string | undefined): number => {
  if (!query || !candidate) return 0;

  const q = normalizeForMatch(query);
  const c = normalizeForMatch(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.92;

  return diceCoefficient(q, c);
};

const readMeta = (
  html: string,
  key: string,
  type: "property" | "name"
): string | undefined => {
  const match = html.match(
    new RegExp(`<meta[^>]+${type}="${key}"[^>]+content="([^"]+)"`, "i")
  );
  return match?.[1] ? cleanText(match[1]) : undefined;
};

const getFirstMatch = (html: string, patterns: RegExp[]): string | null => {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return normalizeUrl(match[1]);
  }
  return null;
};

const hasText = (value: string | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

/** Detect "Summary of X", "Study Guide", "Workbook for X", etc. */
const SPAM_TITLE_PATTERN =
  /\b(summary|study\s*guide|workbook|analysis|cliff\s*notes|sparknotes|book\s*companion)\b/i;

const isSpamTitle = (title: string | undefined, queryTitle: string): boolean => {
  if (!title) return false;
  // Only flag if the spam word is NOT in the original query
  if (SPAM_TITLE_PATTERN.test(queryTitle)) return false;
  return SPAM_TITLE_PATTERN.test(title);
};

const hasUsableMetadata = (result: MetadataResult): boolean =>
  hasText(result.title) ||
  hasText(result.author) ||
  hasText(result.description) ||
  hasText(result.coverPath);

// --- Series extraction helpers ---

/** Extract series from a title like "Fourth Wing (The Empyrean, 1)" → { title, series } */
const extractSeriesFromTitle = (
  rawTitle: string
): { cleanTitle: string; series: string | null } => {
  // Pattern: "Title (Series Name, N)" or "Title (Series Name #N)"
  const parenMatch = rawTitle.match(/^(.+?)\s*\(([^)]+?),?\s*#?(\d+(?:\.\d+)?)\)\s*$/);
  if (parenMatch) {
    return {
      cleanTitle: parenMatch[1].trim(),
      series: `${parenMatch[2].trim()} #${parenMatch[3]}`
    };
  }

  // Pattern: "Title (Series Name)"  — series without number
  const parenNoNum = rawTitle.match(/^(.+?)\s*\(([^)]{3,})\)\s*$/);
  if (parenNoNum && !/edition|vol|book/i.test(parenNoNum[2])) {
    return { cleanTitle: parenNoNum[1].trim(), series: parenNoNum[2].trim() };
  }

  // Pattern: "Title - Series #N" or "Title: Series #N"
  const suffixMatch = rawTitle.match(/^(.+?)\s*[-:–—]\s+(.+?)\s*#(\d+(?:\.\d+)?)\s*$/);
  if (suffixMatch) {
    return {
      cleanTitle: suffixMatch[1].trim(),
      series: `${suffixMatch[2].trim()} #${suffixMatch[3]}`
    };
  }

  return { cleanTitle: rawTitle, series: null };
};

const resolveMetadataProviderSettings = async (): Promise<{
  providerEnabled: MetadataProviderEnabled;
  amazonDomain: string;
  amazonCookie: string;
  googleLanguage: string;
  googleApiKey: string;
  hardcoverApiKey: string;
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterEnabled: boolean;
}> => {
  return {
    providerEnabled: toProviderEnabled(
      await getSetting<unknown>("metadata_provider_enabled", defaultProviderEnabled),
      defaultProviderEnabled
    ),
    amazonDomain: (
      await getSetting<string>("metadata_amazon_domain", config.amazonBooksDomain)
    ).trim(),
    amazonCookie: (
      await getSetting<string>("metadata_amazon_cookie", config.amazonBooksCookie)
    ).trim(),
    googleLanguage: (
      await getSetting<string>("metadata_google_language", config.googleBooksLanguage)
    ).trim(),
    googleApiKey: (
      await getSetting<string>("metadata_google_api_key", config.googleBooksApiKey)
    ).trim(),
    hardcoverApiKey: (
      await getSetting<string>("metadata_hardcover_api_key", config.hardcoverApiKey)
    ).trim(),
    openrouterApiKey: (
      (await getSetting<string>("metadata_openrouter_api_key", config.openrouterApiKey ?? "")) ??
      ""
    ).trim(),
    openrouterModel: (
      (await getSetting<string>("metadata_openrouter_model", "")) ?? ""
    ).trim(),
    openrouterEnabled: await getSetting<boolean>("metadata_openrouter_enabled", false)
  };
};

// ---------- Open Library ----------

const scoreOpenLibraryDoc = (
  doc: {
    title?: string;
    author_name?: string[];
    cover_i?: number;
    key?: string;
  },
  queryTitle: string,
  queryAuthor?: string
): number => {
  if (isSpamTitle(doc.title, queryTitle)) return -1;

  const titleScore = similarityScore(queryTitle, doc.title);
  const authorScore = similarityScore(queryAuthor, doc.author_name?.[0]);

  let completeness = 0;
  if (doc.cover_i) completeness += 0.5;
  if (doc.key) completeness += 0.5;

  return titleScore * 0.58 + authorScore * 0.3 + completeness * 0.12;
};

interface OpenLibraryWorkDetails {
  description?: string;
  series?: string;
}

const fetchOpenLibraryWorkDetails = async (workKey: string): Promise<OpenLibraryWorkDetails> => {
  try {
    const url = `https://openlibrary.org${workKey}.json`;
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return {};

    const json = (await response.json()) as {
      description?: string | { value?: string };
      subjects?: string[];
    };

    let description: string | undefined;
    if (typeof json.description === "string") description = json.description;
    else if (typeof json.description?.value === "string") description = json.description.value;

    // Extract series from subjects: "Serie:The_Empyrean" or "series:name"
    let series: string | undefined;
    for (const subject of json.subjects ?? []) {
      const serieMatch = subject.match(/^[Ss]erie[s]?:(.+)$/);
      if (serieMatch) {
        series = serieMatch[1].replace(/_/g, " ").trim();
        break;
      }
    }

    return { description, series };
  } catch {
    return {};
  }
};

const getOpenLibraryMetadata = async (
  title: string,
  author?: string
): Promise<MetadataResult | null> => {
  const searchUrl = new URL("https://openlibrary.org/search.json");
  searchUrl.searchParams.set("title", title);
  if (author) searchUrl.searchParams.set("author", author);
  searchUrl.searchParams.set("limit", "8");
  searchUrl.searchParams.set("fields", "title,author_name,cover_i,key,first_sentence");

  const response = await fetch(searchUrl, {
    method: "GET",
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;

  const json = (await response.json()) as {
    docs?: Array<{
      title?: string;
      author_name?: string[];
      cover_i?: number;
      key?: string;
      first_sentence?: string[];
    }>;
  };

  let docs = json.docs ?? [];

  if (docs.length === 0) {
    const fallbackUrl = new URL("https://openlibrary.org/search.json");
    fallbackUrl.searchParams.set("q", toQuery(title, author));
    fallbackUrl.searchParams.set("limit", "8");
    fallbackUrl.searchParams.set("fields", "title,author_name,cover_i,key,first_sentence");

    const fallbackResponse = await fetch(fallbackUrl, {
      method: "GET",
      signal: AbortSignal.timeout(8000)
    });
    if (!fallbackResponse.ok) return null;

    const fallbackJson = (await fallbackResponse.json()) as typeof json;
    docs = fallbackJson.docs ?? [];
  }

  if (docs.length === 0) return null;

  const bestDoc = docs
    .map((doc) => ({ doc, score: scoreOpenLibraryDoc(doc, title, author) }))
    .sort((a, b) => b.score - a.score)[0]?.doc;

  if (!bestDoc) return null;

  // Fetch description + series from works endpoint
  let description: string | undefined;
  let series: string | undefined;
  if (bestDoc.key) {
    const details = await fetchOpenLibraryWorkDetails(bestDoc.key);
    description = details.description;
    series = details.series;
  }

  if (!description) {
    description = bestDoc.first_sentence?.[0];
  }

  // Also try extracting series from the title if OL embeds it
  if (!series && bestDoc.title) {
    const extracted = extractSeriesFromTitle(bestDoc.title);
    series = extracted.series ?? undefined;
  }

  return {
    title: bestDoc.title,
    author: bestDoc.author_name?.[0],
    series,
    coverPath: bestDoc.cover_i
      ? `https://covers.openlibrary.org/b/id/${bestDoc.cover_i}-L.jpg`
      : undefined,
    description,
    source: "OPEN_LIBRARY"
  };
};

// ---------- Google Books ----------

const scoreVolumeInfo = (
  volume: {
    title?: string;
    authors?: string[];
    description?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  },
  queryTitle: string,
  queryAuthor?: string
): number => {
  if (isSpamTitle(volume.title, queryTitle)) return -1;

  const titleScore = similarityScore(queryTitle, volume.title);
  const authorScore = similarityScore(queryAuthor, volume.authors?.[0]);

  let completeness = 0;
  if (hasText(volume.description)) completeness += 0.4;
  if (hasText(volume.imageLinks?.thumbnail) || hasText(volume.imageLinks?.smallThumbnail)) {
    completeness += 0.3;
  }
  if ((volume.authors?.length ?? 0) > 0) completeness += 0.3;

  return titleScore * 0.56 + authorScore * 0.3 + completeness * 0.14;
};

type GoogleVolumeInfo = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  description?: string;
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  seriesInfo?: { bookDisplayNumber?: string; shortSeriesBookTitle?: string };
};

const fetchGoogleVolumes = async (
  q: string,
  apiKey: string,
  language: string
): Promise<GoogleVolumeInfo[]> => {
  const searchUrl = new URL("https://www.googleapis.com/books/v1/volumes");
  searchUrl.searchParams.set("q", q);
  searchUrl.searchParams.set("maxResults", "8");
  if (language) searchUrl.searchParams.set("langRestrict", language);
  if (apiKey) searchUrl.searchParams.set("key", apiKey);

  const response = await fetch(searchUrl, {
    method: "GET",
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return [];

  const json = (await response.json()) as {
    items?: Array<{ volumeInfo?: GoogleVolumeInfo }>;
  };

  return (json.items ?? [])
    .map((item) => item.volumeInfo)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const getGoogleMetadata = async (
  title: string,
  author: string | undefined,
  apiKey: string,
  language: string
): Promise<MetadataResult | null> => {
  const structuredQ = [title ? `intitle:${title}` : "", author ? `inauthor:${author}` : ""]
    .filter(Boolean)
    .join("+");

  let candidates = await fetchGoogleVolumes(structuredQ || title, apiKey, language);

  if (candidates.length === 0 && author) {
    candidates = await fetchGoogleVolumes(toQuery(title, author), apiKey, language);
  }

  if (candidates.length === 0 && title) {
    candidates = await fetchGoogleVolumes(title, apiKey, language);
  }

  if (candidates.length === 0) return null;

  const best = candidates
    .map((item) => ({ item, score: scoreVolumeInfo(item, title, author) }))
    .sort((a, b) => b.score - a.score)[0]?.item;

  if (!best) return null;

  // Extract series from seriesInfo or from title
  let series: string | undefined;
  if (best.seriesInfo?.shortSeriesBookTitle) {
    const num = best.seriesInfo.bookDisplayNumber;
    series = num
      ? `${best.seriesInfo.shortSeriesBookTitle} #${num}`
      : best.seriesInfo.shortSeriesBookTitle;
  }
  if (!series && best.title) {
    series = extractSeriesFromTitle(best.title).series ?? undefined;
  }

  return {
    title: best.title,
    author: best.authors?.[0],
    series,
    description: best.description,
    coverPath: best.imageLinks?.thumbnail ?? best.imageLinks?.smallThumbnail,
    source: "GOOGLE"
  };
};

// ---------- Amazon ----------

/** Extract series from Amazon title like "Fourth Wing (The Empyrean, 1)" */
const extractAmazonSeries = (detailHtml: string, titleText?: string): string | undefined => {
  // Try the "Book N of M" pattern near series link
  const bookOfMatch = detailHtml.match(
    /id="seriesBullet"[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?Book\s+(\d+)\s+of/i
  );
  if (bookOfMatch) {
    return `${cleanText(bookOfMatch[1])} #${bookOfMatch[2]}`;
  }

  // Try extracting from the title text: "Title (Series, N)"
  if (titleText) {
    const extracted = extractSeriesFromTitle(titleText);
    if (extracted.series) return extracted.series;
  }

  // Try "Book N of M" standalone
  const standaloneMatch = detailHtml.match(/Book\s+(\d+)\s+of\s+\d+/);
  if (standaloneMatch) {
    // Look for series name nearby in meta content
    const metaTitle = readMeta(detailHtml, "og:title", "property") ?? "";
    const metaExtracted = extractSeriesFromTitle(metaTitle);
    if (metaExtracted.series) return metaExtracted.series;
  }

  return undefined;
};

const getAmazonMetadata = async (
  title: string,
  author: string | undefined,
  domain: string,
  cookie: string
): Promise<MetadataResult | null> => {
  const searchUrl = new URL(`https://www.amazon.${domain}/s`);
  searchUrl.searchParams.set("k", toQuery(title, author));
  searchUrl.searchParams.set("i", "stripbooks-intl-ship");

  const headers: Record<string, string> = {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9"
  };
  if (cookie) headers.cookie = cookie;

  const searchResponse = await fetch(searchUrl, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(10000)
  });
  if (!searchResponse.ok) return null;
  const searchHtml = await searchResponse.text();

  const asinMatch = searchHtml.match(/\/dp\/([A-Z0-9]{10})/i);
  if (!asinMatch) return null;

  const detailUrl = `https://www.amazon.${domain}/dp/${asinMatch[1]}`;
  const detailResponse = await fetch(detailUrl, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(10000)
  });
  if (!detailResponse.ok) return null;
  const detailHtml = await detailResponse.text();

  const parsedTitle =
    readMeta(detailHtml, "og:title", "property") ??
    (() => {
      const titleMatch = detailHtml.match(/id="productTitle"[^>]*>\s*([\s\S]*?)\s*</i);
      return titleMatch?.[1] ? stripTags(titleMatch[1]) : undefined;
    })();

  const bylineMatch = detailHtml.match(
    /id="bylineInfo"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i
  );
  const parsedAuthor = bylineMatch?.[1]
    ? stripTags(bylineMatch[1]).replace(/^by\s+/i, "")
    : undefined;

  const parsedDescription =
    readMeta(detailHtml, "og:description", "property") ??
    readMeta(detailHtml, "description", "name");

  const parsedCover =
    readMeta(detailHtml, "og:image", "property") ??
    (() => {
      const coverMatch = detailHtml.match(
        /id="(?:landingImage|imgBlkFront)"[^>]*(?:data-old-hires|src)="([^"]+)"/i
      );
      return coverMatch?.[1];
    })();

  if (!parsedTitle) return null;

  const series = extractAmazonSeries(detailHtml, parsedTitle);

  // Clean series info out of the title if present
  let cleanedTitle = parsedTitle;
  if (series) {
    const { cleanTitle } = extractSeriesFromTitle(parsedTitle);
    if (cleanTitle !== parsedTitle) cleanedTitle = cleanTitle;
  }

  return {
    title: cleanedTitle,
    author: parsedAuthor,
    series,
    description: parsedDescription,
    coverPath: parsedCover,
    source: "AMAZON"
  };
};

// ---------- Hardcover ----------

const scoreHardcoverDoc = (
  doc: {
    title?: string;
    author_names?: string[];
    description?: string;
    image?: { url?: string };
    ratings_count?: number;
  },
  queryTitle: string,
  queryAuthor?: string
): number => {
  if (isSpamTitle(doc.title, queryTitle)) return -1;

  const titleScore = similarityScore(queryTitle, doc.title);
  const authorScore = similarityScore(queryAuthor, doc.author_names?.[0]);

  let completeness = 0;
  if (hasText(doc.description)) completeness += 0.4;
  if (hasText(doc.image?.url)) completeness += 0.4;
  // Prefer books with actual ratings (real books, not study guides)
  const rc = doc.ratings_count ?? 0;
  if (rc > 100) completeness += 0.2;
  else if (rc > 0) completeness += 0.1;

  return titleScore * 0.5 + authorScore * 0.3 + completeness * 0.2;
};

const getHardcoverMetadata = async (
  title: string,
  author: string | undefined,
  apiKey: string
): Promise<MetadataResult | null> => {
  if (!apiKey) return null;

  const query = toQuery(title, author);
  const response = await fetch("https://api.hardcover.app/v1/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      query: `query BookSearch($q: String!, $limit: Int!) {
        search(query: $q, query_type: "Book", per_page: $limit, page: 1) { results }
      }`,
      variables: { q: query, limit: 8 }
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;

  const json = (await response.json()) as {
    data?: {
      search?: {
        results?: {
          hits?: Array<{
            document?: {
              title?: string;
              author_names?: string[];
              description?: string;
              image?: { url?: string };
              series_names?: string[];
              series_position?: number;
              ratings_count?: number;
            };
          }>;
        };
      };
    };
  };

  const docs = (json.data?.search?.results?.hits ?? [])
    .map((hit) => hit.document)
    .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc));

  if (docs.length === 0) return null;

  const best = docs
    .map((doc) => ({ doc, score: scoreHardcoverDoc(doc, title, author) }))
    .sort((a, b) => b.score - a.score)[0]?.doc;

  if (!best) return null;

  let series: string | undefined;
  const seriesName = best.series_names?.[0];
  if (seriesName) {
    series = best.series_position
      ? `${seriesName} #${best.series_position}`
      : seriesName;
  }
  if (!series && best.title) {
    series = extractSeriesFromTitle(best.title).series ?? undefined;
  }

  return {
    title: best.title,
    author: best.author_names?.[0],
    series,
    description: best.description,
    coverPath: best.image?.url,
    source: "HARDCOVER"
  };
};

// ---------- Goodreads ----------

interface GoodreadsSearchCandidate {
  href: string;
  title?: string;
  author?: string;
}

const extractGoodreadsCandidates = (searchHtml: string): GoodreadsSearchCandidate[] => {
  const rows = searchHtml.match(/<tr[^>]*itemtype=http:\/\/schema\.org\/Book[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const candidates: GoodreadsSearchCandidate[] = [];

  for (const row of rows.slice(0, 10)) {
    const hrefMatch = row.match(
      /href="(\/book\/show\/[^"]+|https:\/\/www\.goodreads\.com\/book\/show\/[^"]+)"/i
    );
    if (!hrefMatch?.[1]) continue;

    const titleMatch =
      row.match(/class="bookTitle"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) ??
      row.match(/class="bookTitle"[^>]*>\s*([\s\S]*?)\s*<\/a>/i);

    const authorMatch =
      row.match(/class="authorName"[\s\S]*?<span[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/span>/i) ??
      row.match(/class="authorName"[^>]*>\s*([\s\S]*?)\s*<\/a>/i);

    candidates.push({
      href: normalizeUrl(hrefMatch[1]),
      title: titleMatch?.[1] ? stripTags(titleMatch[1]) : undefined,
      author: authorMatch?.[1] ? stripTags(authorMatch[1]) : undefined
    });
  }

  const deduped: GoodreadsSearchCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const href = normalizeUrl(candidate.href);
    if (seen.has(href)) continue;
    seen.add(href);
    deduped.push({ ...candidate, href });
  }

  return deduped;
};

/** Extract series from Goodreads Apollo state JSON embedded in the detail page */
const extractGoodreadsSeries = (detailHtml: string): string | undefined => {
  // Apollo state: "Series:kca://...":{"title":"The Empyrean",...}
  const seriesMatch = detailHtml.match(
    /"Series:[^"]*":\{[^}]*"title":"([^"]+)"[^}]*\}/
  );
  const seriesName = seriesMatch?.[1];
  if (!seriesName) return undefined;

  // Position: "bookSeries":[{"userPosition":"1","series":...}]
  const positionMatch = detailHtml.match(
    /"bookSeries":\[\{[^}]*"userPosition":"(\d+(?:\.\d+)?)"/
  );
  const position = positionMatch?.[1];

  return position ? `${seriesName} #${position}` : seriesName;
};

const getGoodreadsMetadata = async (
  title: string,
  author?: string
): Promise<MetadataResult | null> => {
  const searchUrl = new URL("https://www.goodreads.com/search");
  searchUrl.searchParams.set("q", toQuery(title, author));

  const searchResponse = await fetch(searchUrl, {
    method: "GET",
    signal: AbortSignal.timeout(10000)
  });
  if (!searchResponse.ok) return null;
  const searchHtml = await searchResponse.text();

  let candidates = extractGoodreadsCandidates(searchHtml);
  if (candidates.length === 0) {
    // Fallback: grab all book links and pick one that isn't spam
    const allHrefs = [...searchHtml.matchAll(/href="(\/book\/show\/[^"]+)"/gi)]
      .map((m) => m[1])
      .filter((href, i, arr) => arr.indexOf(href) === i);

    for (const href of allHrefs) {
      // Check if the URL slug looks like spam
      const slug = href.replace(/.*\/book\/show\/\d+-?/, "");
      if (!SPAM_TITLE_PATTERN.test(slug.replace(/-/g, " "))) {
        candidates = [{ href }];
        break;
      }
    }
  }

  if (candidates.length === 0) return null;

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: isSpamTitle(candidate.title, title)
        ? -1
        : similarityScore(title, candidate.title) * 0.6 +
          similarityScore(author, candidate.author) * 0.35 +
          (hasText(candidate.author) ? 0.05 : 0)
    }))
    .sort((a, b) => b.score - a.score);

  const bestCandidate = scored[0]?.score >= 0 ? scored[0].candidate : undefined;
  if (!bestCandidate) return null;

  const detailUrl = absoluteUrl("https://www.goodreads.com", bestCandidate.href);
  const detailResponse = await fetch(detailUrl, {
    method: "GET",
    signal: AbortSignal.timeout(10000)
  });
  if (!detailResponse.ok) return null;
  const detailHtml = await detailResponse.text();

  const rawTitle =
    readMeta(detailHtml, "og:title", "property") ??
    readMeta(detailHtml, "title", "name");
  const parsedTitle = rawTitle?.replace(/\s*\|\s*Goodreads\s*$/i, "").trim();

  const authorMatch = detailHtml.match(/ContributorLink__name[^>]*>\s*([^<]+)\s*</i);
  const parsedAuthor = authorMatch?.[1] ? cleanText(authorMatch[1]) : undefined;

  const parsedDescription =
    readMeta(detailHtml, "og:description", "property") ??
    readMeta(detailHtml, "description", "name");
  const parsedCover = readMeta(detailHtml, "og:image", "property");

  const series = extractGoodreadsSeries(detailHtml);

  if (!parsedTitle) return null;

  return {
    title: parsedTitle,
    author: parsedAuthor,
    series,
    description: parsedDescription,
    coverPath: parsedCover,
    source: "GOODREADS"
  };
};

// ---------- Douban ----------

const getDoubanMetadata = async (
  title: string,
  author?: string
): Promise<MetadataResult | null> => {
  const query = encodeURIComponent(toQuery(title, author)).replace(/%20/g, "+");
  const searchUrl = `https://search.douban.com/book/subject_search?search_text=${query}`;

  const searchResponse = await fetch(searchUrl, {
    method: "GET",
    signal: AbortSignal.timeout(10000)
  });
  if (!searchResponse.ok) return null;
  const searchHtml = await searchResponse.text();

  const firstBookHref = getFirstMatch(searchHtml, [
    /href="(https?:\/\/book\.douban\.com\/subject\/\d+\/)"/i,
    /(https?:\\\/\\\/book\.douban\.com\\\/subject\\\/\d+\\\/)/i
  ]);
  if (!firstBookHref) return null;

  const detailUrl = normalizeUrl(firstBookHref);
  const detailResponse = await fetch(detailUrl, {
    method: "GET",
    signal: AbortSignal.timeout(10000)
  });
  if (!detailResponse.ok) return null;
  const detailHtml = await detailResponse.text();

  const titleMatch = detailHtml.match(/<title>\s*([^<]+?)\s*\(豆瓣\)\s*<\/title>/i);
  const parsedTitle = titleMatch?.[1] ? cleanText(titleMatch[1]) : undefined;

  const authorMatch = detailHtml.match(/作者[^<]*<\/span>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
  const parsedAuthor = authorMatch?.[1] ? cleanText(authorMatch[1]) : undefined;

  const parsedDescription =
    readMeta(detailHtml, "description", "name") ??
    (() => {
      const match = detailHtml.match(/id="link-report"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
      return match?.[1] ? stripTags(match[1]) : undefined;
    })();

  const parsedCover =
    readMeta(detailHtml, "og:image", "property") ??
    (() => {
      const coverMatch = detailHtml.match(/id="mainpic"[\s\S]*?<img[^>]+src="([^"]+)"/i);
      return coverMatch?.[1];
    })();

  if (!parsedTitle) return null;

  return {
    title: parsedTitle,
    author: parsedAuthor,
    description: parsedDescription,
    coverPath: parsedCover,
    source: "DOUBAN"
  };
};

// ---------- Provider orchestration ----------

type MetadataSettings = Awaited<ReturnType<typeof resolveMetadataProviderSettings>>;

type ProviderFetcher = (
  title: string,
  author: string | undefined,
  settings: MetadataSettings
) => Promise<MetadataResult | null>;

const providerFetchers: Record<MetadataProvider, ProviderFetcher> = {
  open_library: (title, author) => getOpenLibraryMetadata(title, author),
  amazon: (title, author, settings) =>
    getAmazonMetadata(title, author, settings.amazonDomain || "com", settings.amazonCookie),
  google: (title, author, settings) =>
    getGoogleMetadata(title, author, settings.googleApiKey, settings.googleLanguage),
  hardcover: (title, author, settings) =>
    getHardcoverMetadata(title, author, settings.hardcoverApiKey),
  goodreads: (title, author) => getGoodreadsMetadata(title, author),
  douban: (title, author) => getDoubanMetadata(title, author)
};

const buildProviderFetchOrder = (providerEnabled: MetadataProviderEnabled): MetadataProvider[] =>
  providerPreference.filter((provider) => providerEnabled[provider]);

const metadataCompleteness = (result: MetadataResult): number => {
  let presentFields = 0;
  if (hasText(result.title)) presentFields += 1;
  if (hasText(result.author)) presentFields += 1;
  if (hasText(result.description)) presentFields += 1;
  if (hasText(result.coverPath)) presentFields += 1;
  if (hasText(result.series)) presentFields += 1;
  return presentFields / 5;
};

const buildCandidate = (
  provider: MetadataProvider,
  metadata: MetadataResult,
  queryTitle: string,
  queryAuthor?: string
): ProviderCandidate => {
  const titleScore = similarityScore(queryTitle, metadata.title);
  const authorScore = similarityScore(queryAuthor, metadata.author);
  const completeness = metadataCompleteness(metadata);
  const trust = providerTrustScore[provider] ?? 0.9;
  const overallScore =
    titleScore * 0.5 + authorScore * 0.2 + completeness * 0.2 + trust * 0.1;

  return {
    provider,
    metadata,
    titleScore,
    authorScore,
    completeness,
    trust,
    overallScore
  };
};

const selectBestField = (
  candidates: ProviderCandidate[],
  extractor: (metadata: MetadataResult) => string | undefined,
  scorer: (candidate: ProviderCandidate, value: string) => number
): string | undefined => {
  let bestValue: string | undefined;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const value = extractor(candidate.metadata);
    if (!hasText(value)) continue;

    const score = scorer(candidate, value);
    if (score > bestScore) {
      bestScore = score;
      bestValue = value;
    }
  }

  return bestValue;
};

const truncateForPrompt = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
};

const toOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveDescriptionFromProviders = (
  candidates: ProviderCandidate[],
  llmDescription: string | undefined
): string | undefined => {
  if (!hasText(llmDescription)) return undefined;

  const llmNormalized = normalizeForMatch(llmDescription);
  if (!llmNormalized) return undefined;

  let bestValue: string | undefined;
  let bestScore = 0;

  for (const candidate of candidates) {
    const description = candidate.metadata.description;
    if (!hasText(description)) continue;

    const snippet = truncateForPrompt(cleanText(description), 200);
    const snippetNormalized = normalizeForMatch(snippet);
    const fullNormalized = normalizeForMatch(description);
    if (!snippetNormalized && !fullNormalized) continue;

    let score = 0;
    if (snippetNormalized === llmNormalized || fullNormalized === llmNormalized) {
      score = 1;
    } else if (
      snippetNormalized.includes(llmNormalized) ||
      llmNormalized.includes(snippetNormalized)
    ) {
      score = 0.96;
    } else if (fullNormalized.includes(llmNormalized) || llmNormalized.includes(fullNormalized)) {
      score = 0.92;
    } else {
      score = Math.max(
        similarityScore(llmDescription, snippet),
        similarityScore(llmDescription, description)
      );
    }

    if (score > bestScore) {
      bestScore = score;
      bestValue = description;
    }
  }

  return bestScore >= 0.45 ? bestValue : undefined;
};

const resolveCoverFromProviders = (
  candidates: ProviderCandidate[],
  llmCoverPath: string | undefined
): string | undefined => {
  if (!hasText(llmCoverPath)) return undefined;
  const llmCover = llmCoverPath.trim();

  let bestValue: string | undefined;
  let bestScore = 0;

  for (const candidate of candidates) {
    const coverPath = candidate.metadata.coverPath;
    if (!hasText(coverPath)) continue;

    if (coverPath.trim() === llmCover) {
      return coverPath;
    }

    const normalizedCover = normalizeUrl(coverPath.trim());
    if (normalizedCover === normalizeUrl(llmCover)) {
      return coverPath;
    }

    const score = similarityScore(llmCover, coverPath);
    if (score > bestScore) {
      bestScore = score;
      bestValue = coverPath;
    }
  }

  return bestScore >= 0.75 ? bestValue : undefined;
};

const resolveWithLlm = async (
  queryTitle: string,
  queryAuthor: string | undefined,
  candidates: ProviderCandidate[],
  apiKey: string,
  model: string
): Promise<MetadataResult | null> => {
  if (!hasText(apiKey) || !hasText(model) || candidates.length === 0) return null;

  const systemMessage = `You are a book metadata resolver. You receive a search query (derived from a filename - this is the source of truth for what the user is looking for) and results from multiple metadata providers.

Your job:
1. The query title and author come from the filename. They define WHICH BOOK the user wants. If a provider returned metadata for the wrong book (e.g. a study guide, a different edition by a different author, or a completely different book), ignore that provider's data entirely.
2. For each field, pick the best value from the providers that matched the correct book. If you believe a provider's value is wrong or inaccurate (e.g. wrong author, wrong series), return the correct value from your own knowledge instead.
3. If NO provider has a field (especially series), fill it from your own knowledge if you are confident.
4. Never fabricate a description or cover URL - only pick from providers or omit.

Return a JSON object with exactly these fields (omit or null any field you cannot determine):
{ "title", "author", "series", "description", "coverPath" }

Rules:
- title: The canonical title of the book. Fix casing/spelling if providers got it wrong.
- author: The real author. If providers returned a study guide author or publisher, correct it.
- series: Format as "Series Name #N" (e.g. "The Empyrean #1"). Include position number if known. If the book is standalone, omit or null.
- description: Pick the most relevant and complete description from providers. Do not write your own.
- coverPath: Pick the best cover URL from providers. Do not generate one.`;

  const providerRows = candidates
    .map((candidate, index) => {
      const metadata = candidate.metadata;
      const descriptionSnippet = hasText(metadata.description)
        ? truncateForPrompt(cleanText(metadata.description), 200)
        : "";
      const coverFlag = hasText(metadata.coverPath) ? "yes" : "no";
      const coverValue = hasText(metadata.coverPath) ? metadata.coverPath : "";

      return `${index + 1}. [${candidate.provider}] title=${JSON.stringify(metadata.title ?? "")} author=${JSON.stringify(metadata.author ?? "")} series=${JSON.stringify(metadata.series ?? "")} description=${JSON.stringify(descriptionSnippet)} cover=${coverFlag} coverPath=${JSON.stringify(coverValue)}`;
    })
    .join("\n");

  const userMessage = `Query: title=${JSON.stringify(queryTitle)}, author=${JSON.stringify(queryAuthor ?? "")}

Provider results:
${providerRows}`;

  try {
    const parsed = await callOpenRouterJsonObject({
      apiKey,
      model,
      systemMessage,
      userMessage,
      timeoutMs: 15000
    });
    if (!parsed) return null;

    const title = toOptionalText(parsed.title);
    const author = toOptionalText(parsed.author);
    const series = toOptionalText(parsed.series);
    const description = resolveDescriptionFromProviders(
      candidates,
      toOptionalText(parsed.description)
    );
    const coverPath = resolveCoverFromProviders(candidates, toOptionalText(parsed.coverPath));

    if (!hasText(title) && !hasText(author) && !hasText(series) && !description && !coverPath) {
      return null;
    }

    return {
      source: "NONE",
      title,
      author,
      series,
      description,
      coverPath
    };
  } catch {
    return null;
  }
};

export const fetchMetadataWithFallback = async (
  title: string,
  author?: string
): Promise<MetadataResult> => {
  const settings = await resolveMetadataProviderSettings();
  const providerOrder = buildProviderFetchOrder(settings.providerEnabled);

  if (providerOrder.length === 0) {
    return { source: "NONE" };
  }

  // Fetch all enabled providers in parallel
  const results = await Promise.allSettled(
    providerOrder.map(async (provider) => {
      const fetcher = providerFetchers[provider];
      if (!fetcher) return { provider, result: null as MetadataResult | null };
      const result = await fetcher(title, author, settings);
      return { provider, result };
    })
  );

  const candidates: ProviderCandidate[] = [];

  for (const settled of results) {
    if (settled.status !== "fulfilled") continue;
    const { provider, result } = settled.value;
    if (!result || !hasUsableMetadata(result)) continue;
    candidates.push(buildCandidate(provider, result, title, author));
  }

  if (candidates.length === 0) {
    return { source: "NONE" };
  }

  candidates.sort((a, b) => b.overallScore - a.overallScore);
  const bestSource = candidates[0].metadata.source;

  if (
    settings.openrouterEnabled &&
    hasText(settings.openrouterApiKey) &&
    hasText(settings.openrouterModel)
  ) {
    const llmResolved = await resolveWithLlm(
      title,
      author,
      candidates,
      settings.openrouterApiKey,
      settings.openrouterModel
    );

    if (llmResolved) {
      return {
        ...llmResolved,
        source: bestSource
      };
    }
  }

  const mergedTitle = selectBestField(
    candidates,
    (metadata) => metadata.title,
    (candidate) =>
      candidate.titleScore * 0.75 + candidate.trust * 0.15 + candidate.completeness * 0.1
  );
  const mergedAuthor = selectBestField(
    candidates,
    (metadata) => metadata.author,
    (candidate) =>
      candidate.authorScore * 0.75 + candidate.trust * 0.15 + candidate.completeness * 0.1
  );
  const mergedSeries = selectBestField(
    candidates,
    (metadata) => metadata.series,
    (candidate) =>
      candidate.titleScore * 0.4 +
      candidate.trust * 0.3 +
      candidate.completeness * 0.3
  );
  const mergedDescription = selectBestField(
    candidates,
    (metadata) => metadata.description,
    (candidate) =>
      candidate.completeness * 0.5 +
      candidate.titleScore * 0.2 +
      candidate.authorScore * 0.1 +
      candidate.trust * 0.2
  );
  const mergedCoverPath = selectBestField(
    candidates,
    (metadata) => metadata.coverPath,
    (candidate) =>
      candidate.completeness * 0.45 +
      candidate.titleScore * 0.2 +
      candidate.authorScore * 0.1 +
      candidate.trust * 0.25
  );

  if (
    !hasText(mergedTitle) &&
    !hasText(mergedAuthor) &&
    !hasText(mergedDescription) &&
    !hasText(mergedCoverPath)
  ) {
    return { source: "NONE" };
  }

  return {
    source: bestSource,
    title: mergedTitle,
    author: mergedAuthor,
    series: mergedSeries,
    description: mergedDescription,
    coverPath: mergedCoverPath
  };
};
