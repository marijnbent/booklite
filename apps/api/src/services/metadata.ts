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
  | "douban"
  | "none";

const isMetadataProvider = (value: unknown): value is MetadataProvider =>
  value === "open_library" ||
  value === "amazon" ||
  value === "google" ||
  value === "hardcover" ||
  value === "goodreads" ||
  value === "douban" ||
  value === "none";

const toProvider = (
  value: unknown,
  fallback: MetadataProvider
): MetadataProvider => (isMetadataProvider(value) ? value : fallback);

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
  providerOrder: MetadataProvider[];
  amazonDomain: string;
  amazonCookie: string;
  googleLanguage: string;
  googleApiKey: string;
  hardcoverApiKey: string;
}> => {
  const legacyFallback = await getSetting<"google" | "none">(
    "metadata_provider_fallback",
    "google"
  );
  const defaultSecondary: MetadataProvider =
    legacyFallback === "google" ? "google" : "none";

  const primary = toProvider(
    await getSetting<MetadataProvider>("metadata_provider_primary", "open_library"),
    "open_library"
  );
  const secondary = toProvider(
    await getSetting<MetadataProvider>("metadata_provider_secondary", defaultSecondary),
    defaultSecondary
  );
  const tertiary = toProvider(
    await getSetting<MetadataProvider>("metadata_provider_tertiary", "none"),
    "none"
  );

  const seen = new Set<MetadataProvider>();
  const providerOrder: MetadataProvider[] = [];
  for (const provider of [primary, secondary, tertiary]) {
    if (provider === "none" || seen.has(provider)) continue;
    seen.add(provider);
    providerOrder.push(provider);
  }
  if (providerOrder.length === 0) providerOrder.push("open_library");

  return {
    providerOrder,
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

const getOpenLibraryMetadata = async (
  title: string,
  author?: string
): Promise<MetadataResult | null> => {
  const searchUrl = new URL("https://openlibrary.org/search.json");
  searchUrl.searchParams.set("q", toQuery(title, author));
  searchUrl.searchParams.set("limit", "5");

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

  const doc = json.docs?.[0];
  if (!doc) return null;

  return {
    title: doc.title,
    author: doc.author_name?.[0],
    coverPath: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : undefined,
    description:
      typeof doc.first_sentence === "string"
        ? doc.first_sentence
        : Array.isArray(doc.first_sentence)
          ? doc.first_sentence[0]
          : undefined,
    source: "OPEN_LIBRARY"
  };
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
  searchUrl.searchParams.set("maxResults", "3");
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

  const item = json.items?.[0]?.volumeInfo;
  if (!item) return null;

  return {
    title: item.title,
    author: item.authors?.[0],
    description: item.description,
    coverPath: item.imageLinks?.thumbnail ?? item.imageLinks?.smallThumbnail,
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
      variables: { q: query, limit: 3 }
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

  const document = json.data?.search?.results?.hits?.[0]?.document;
  if (!document) return null;

  return {
    title: document.title,
    author: document.author_names?.[0],
    description: document.description,
    coverPath: document.image?.url,
    source: "HARDCOVER"
  };
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

  const firstBookHref = getFirstMatch(searchHtml, [
    /href="(\/book\/show\/[^"]+)"/i,
    /href="(https:\/\/www\.goodreads\.com\/book\/show\/[^"]+)"/i
  ]);
  if (!firstBookHref) return null;

  const detailUrl = absoluteUrl("https://www.goodreads.com", firstBookHref);
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

const providerFetchers: Record<Exclude<MetadataProvider, "none">, ProviderFetcher> = {
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

export const fetchMetadataWithFallback = async (
  title: string,
  author?: string
): Promise<MetadataResult> => {
  const settings = await resolveMetadataProviderSettings();
  const merged: Omit<MetadataResult, "source"> = {};
  let resolvedSource: MetadataResult["source"] | null = null;

  for (const provider of settings.providerOrder) {
    if (provider === "none") continue;
    const fetcher = providerFetchers[provider];
    if (!fetcher) continue;

    let result: MetadataResult | null = null;
    try {
      result = await fetcher(title, author, settings);
    } catch {
      continue;
    }

    if (!result || !hasUsableMetadata(result)) continue;

    if (!resolvedSource) resolvedSource = result.source;
    if (!hasText(merged.title) && hasText(result.title)) merged.title = result.title;
    if (!hasText(merged.author) && hasText(result.author)) merged.author = result.author;
    if (!hasText(merged.description) && hasText(result.description)) {
      merged.description = result.description;
    }
    if (!hasText(merged.coverPath) && hasText(result.coverPath)) {
      merged.coverPath = result.coverPath;
    }
  }

  if (!resolvedSource) return { source: "NONE" };
  return {
    ...merged,
    source: resolvedSource
  };
};
