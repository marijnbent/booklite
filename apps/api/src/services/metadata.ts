import { config } from "../config";
import { getSetting } from "../db/client";

export interface MetadataResult {
  title?: string;
  author?: string;
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

const tokenOverlapScore = (query: string, candidate: string): number => {
  const queryTokens = new Set(tokenize(query));
  const candidateTokens = new Set(tokenize(candidate));
  if (queryTokens.size === 0 || candidateTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) intersection += 1;
  }

  const union = queryTokens.size + candidateTokens.size - intersection;
  if (union <= 0) return 0;
  return intersection / union;
};

const similarityScore = (query: string | undefined, candidate: string | undefined): number => {
  if (!query || !candidate) return 0;

  const q = normalizeForMatch(query);
  const c = normalizeForMatch(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.92;

  return tokenOverlapScore(q, c);
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

const hasUsableMetadata = (result: MetadataResult): boolean =>
  hasText(result.title) ||
  hasText(result.author) ||
  hasText(result.description) ||
  hasText(result.coverPath);

const resolveMetadataProviderSettings = async (): Promise<{
  providerEnabled: MetadataProviderEnabled;
  amazonDomain: string;
  amazonCookie: string;
  googleLanguage: string;
  googleApiKey: string;
  hardcoverApiKey: string;
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
    ).trim()
  };
};

const scoreOpenLibraryDoc = (
  doc: {
    title?: string;
    author_name?: string[];
    cover_i?: number;
    first_sentence?: string | string[];
  },
  queryTitle: string,
  queryAuthor?: string
): number => {
  const titleScore = similarityScore(queryTitle, doc.title);
  const authorScore = similarityScore(queryAuthor, doc.author_name?.[0]);
  const description =
    typeof doc.first_sentence === "string"
      ? doc.first_sentence
      : Array.isArray(doc.first_sentence)
        ? doc.first_sentence[0]
        : undefined;

  let completeness = 0;
  if (doc.cover_i) completeness += 0.5;
  if (hasText(description)) completeness += 0.5;

  return titleScore * 0.58 + authorScore * 0.3 + completeness * 0.12;
};

const getOpenLibraryMetadata = async (
  title: string,
  author?: string
): Promise<MetadataResult | null> => {
  const searchUrl = new URL("https://openlibrary.org/search.json");
  searchUrl.searchParams.set("q", toQuery(title, author));
  searchUrl.searchParams.set("limit", "10");

  const response = await fetch(searchUrl, { method: "GET" });
  if (!response.ok) return null;

  const json = (await response.json()) as {
    docs?: Array<{
      title?: string;
      author_name?: string[];
      cover_i?: number;
      first_sentence?: string | string[];
    }>;
  };

  const docs = json.docs ?? [];
  if (docs.length === 0) return null;

  const bestDoc = docs
    .map((doc) => ({ doc, score: scoreOpenLibraryDoc(doc, title, author) }))
    .sort((a, b) => b.score - a.score)[0]?.doc;

  if (!bestDoc) return null;

  return {
    title: bestDoc.title,
    author: bestDoc.author_name?.[0],
    coverPath: bestDoc.cover_i
      ? `https://covers.openlibrary.org/b/id/${bestDoc.cover_i}-L.jpg`
      : undefined,
    description:
      typeof bestDoc.first_sentence === "string"
        ? bestDoc.first_sentence
        : Array.isArray(bestDoc.first_sentence)
          ? bestDoc.first_sentence[0]
          : undefined,
    source: "OPEN_LIBRARY"
  };
};

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

const getGoogleMetadata = async (
  title: string,
  author: string | undefined,
  apiKey: string,
  language: string
): Promise<MetadataResult | null> => {
  const q = [title ? `intitle:${title}` : "", author ? `inauthor:${author}` : ""]
    .filter(Boolean)
    .join("+");

  const searchUrl = new URL("https://www.googleapis.com/books/v1/volumes");
  searchUrl.searchParams.set("q", q || title);
  searchUrl.searchParams.set("maxResults", "8");
  if (language) searchUrl.searchParams.set("langRestrict", language);
  if (apiKey) searchUrl.searchParams.set("key", apiKey);

  const response = await fetch(searchUrl, { method: "GET" });
  if (!response.ok) return null;

  const json = (await response.json()) as {
    items?: Array<{
      volumeInfo?: {
        title?: string;
        authors?: string[];
        description?: string;
        imageLinks?: { thumbnail?: string; smallThumbnail?: string };
      };
    }>;
  };

  const candidates = (json.items ?? [])
    .map((item) => item.volumeInfo)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (candidates.length === 0) return null;

  const best = candidates
    .map((item) => ({ item, score: scoreVolumeInfo(item, title, author) }))
    .sort((a, b) => b.score - a.score)[0]?.item;

  if (!best) return null;

  return {
    title: best.title,
    author: best.authors?.[0],
    description: best.description,
    coverPath: best.imageLinks?.thumbnail ?? best.imageLinks?.smallThumbnail,
    source: "GOOGLE"
  };
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

  const searchResponse = await fetch(searchUrl, { method: "GET", headers });
  if (!searchResponse.ok) return null;
  const searchHtml = await searchResponse.text();

  const asinMatch = searchHtml.match(/\/dp\/([A-Z0-9]{10})/i);
  if (!asinMatch) return null;

  const detailUrl = `https://www.amazon.${domain}/dp/${asinMatch[1]}`;
  const detailResponse = await fetch(detailUrl, { method: "GET", headers });
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

  return {
    title: parsedTitle,
    author: parsedAuthor,
    description: parsedDescription,
    coverPath: parsedCover,
    source: "AMAZON"
  };
};

const scoreHardcoverDoc = (
  doc: {
    title?: string;
    author_names?: string[];
    description?: string;
    image?: { url?: string };
  },
  queryTitle: string,
  queryAuthor?: string
): number => {
  const titleScore = similarityScore(queryTitle, doc.title);
  const authorScore = similarityScore(queryAuthor, doc.author_names?.[0]);

  let completeness = 0;
  if (hasText(doc.description)) completeness += 0.5;
  if (hasText(doc.image?.url)) completeness += 0.5;

  return titleScore * 0.58 + authorScore * 0.3 + completeness * 0.12;
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
      query:
        'query BookSearch($q: String!, $limit: Int!) { search(query: $q, query_type: "Book", per_page: $limit, page: 1) { results } }',
      variables: { q: query, limit: 8 }
    })
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

  return {
    title: best.title,
    author: best.author_names?.[0],
    description: best.description,
    coverPath: best.image?.url,
    source: "HARDCOVER"
  };
};

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

const getGoodreadsMetadata = async (
  title: string,
  author?: string
): Promise<MetadataResult | null> => {
  const searchUrl = new URL("https://www.goodreads.com/search");
  searchUrl.searchParams.set("q", toQuery(title, author));

  const searchResponse = await fetch(searchUrl, { method: "GET" });
  if (!searchResponse.ok) return null;
  const searchHtml = await searchResponse.text();

  let candidates = extractGoodreadsCandidates(searchHtml);
  if (candidates.length === 0) {
    const firstBookHref = getFirstMatch(searchHtml, [
      /href="(\/book\/show\/[^"]+)"/i,
      /href="(https:\/\/www\.goodreads\.com\/book\/show\/[^"]+)"/i
    ]);
    if (firstBookHref) {
      candidates = [{ href: firstBookHref }];
    }
  }

  if (candidates.length === 0) return null;

  const bestCandidate = candidates
    .map((candidate) => ({
      candidate,
      score:
        similarityScore(title, candidate.title) * 0.6 +
        similarityScore(author, candidate.author) * 0.35 +
        (hasText(candidate.author) ? 0.05 : 0)
    }))
    .sort((a, b) => b.score - a.score)[0]?.candidate;

  if (!bestCandidate) return null;

  const detailUrl = absoluteUrl("https://www.goodreads.com", bestCandidate.href);
  const detailResponse = await fetch(detailUrl, { method: "GET" });
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

  if (!parsedTitle) return null;

  return {
    title: parsedTitle,
    author: parsedAuthor,
    description: parsedDescription,
    coverPath: parsedCover,
    source: "GOODREADS"
  };
};

const getDoubanMetadata = async (
  title: string,
  author?: string
): Promise<MetadataResult | null> => {
  const query = encodeURIComponent(toQuery(title, author)).replace(/%20/g, "+");
  const searchUrl = `https://search.douban.com/book/subject_search?search_text=${query}`;

  const searchResponse = await fetch(searchUrl, { method: "GET" });
  if (!searchResponse.ok) return null;
  const searchHtml = await searchResponse.text();

  const firstBookHref = getFirstMatch(searchHtml, [
    /href="(https?:\/\/book\.douban\.com\/subject\/\d+\/)"/i,
    /(https?:\\\/\\\/book\.douban\.com\\\/subject\\\/\d+\\\/)/i
  ]);
  if (!firstBookHref) return null;

  const detailUrl = normalizeUrl(firstBookHref);
  const detailResponse = await fetch(detailUrl, { method: "GET" });
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
  return presentFields / 4;
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

export const fetchMetadataWithFallback = async (
  title: string,
  author?: string
): Promise<MetadataResult> => {
  const settings = await resolveMetadataProviderSettings();
  const providerOrder = buildProviderFetchOrder(settings.providerEnabled);

  if (providerOrder.length === 0) {
    return { source: "NONE" };
  }

  const candidates: ProviderCandidate[] = [];

  for (const provider of providerOrder) {
    const fetcher = providerFetchers[provider];
    if (!fetcher) continue;

    let result: MetadataResult | null = null;
    try {
      result = await fetcher(title, author, settings);
    } catch {
      continue;
    }

    if (!result || !hasUsableMetadata(result)) continue;

    candidates.push(buildCandidate(provider, result, title, author));
  }

  if (candidates.length === 0) {
    return { source: "NONE" };
  }

  candidates.sort((a, b) => b.overallScore - a.overallScore);
  const bestSource = candidates[0].metadata.source;

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
    description: mergedDescription,
    coverPath: mergedCoverPath
  };
};
