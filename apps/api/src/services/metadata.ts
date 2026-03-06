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
    | "LUBIMYCZYTAC"
    | "RANOBEDB"
    | "COMICVINE"
    | "AUDIBLE"
    | "NONE";
}

type MetadataProvider =
  | "open_library"
  | "amazon"
  | "google"
  | "hardcover"
  | "goodreads"
  | "douban"
  | "lubimyczytac"
  | "ranobedb"
  | "comicvine"
  | "audible"
  | "none";

const isMetadataProvider = (value: unknown): value is MetadataProvider =>
  value === "open_library" ||
  value === "amazon" ||
  value === "google" ||
  value === "hardcover" ||
  value === "goodreads" ||
  value === "douban" ||
  value === "lubimyczytac" ||
  value === "ranobedb" ||
  value === "comicvine" ||
  value === "audible" ||
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

const resolveMetadataProviderSettings = async (): Promise<{
  providerOrder: MetadataProvider[];
  amazonDomain: string;
  amazonCookie: string;
  googleLanguage: string;
  googleApiKey: string;
  hardcoverApiKey: string;
  comicvineApiKey: string;
  audibleDomain: string;
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
    ).trim(),
    comicvineApiKey: (
      await getSetting<string>("metadata_comicvine_api_key", config.comicvineApiKey)
    ).trim(),
    audibleDomain: (
      await getSetting<string>("metadata_audible_domain", config.audibleDomain)
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

const getLubimyczytacMetadata = async (
  title: string,
  author?: string
): Promise<MetadataResult | null> => {
  const searchUrl = new URL("https://lubimyczytac.pl/szukaj/ksiazki");
  searchUrl.searchParams.set("phrase", title);
  if (author) searchUrl.searchParams.set("author", author);

  const searchResponse = await fetch(searchUrl, { method: "GET" });
  if (!searchResponse.ok) return null;
  const searchHtml = await searchResponse.text();

  const firstBookHref = getFirstMatch(searchHtml, [
    /href="(https?:\/\/lubimyczytac\.pl\/ksiazka\/[^"]+)"/i,
    /href="(\/ksiazka\/[^"]+)"/i
  ]);
  if (!firstBookHref) return null;

  const detailUrl = absoluteUrl("https://lubimyczytac.pl", firstBookHref);
  const detailResponse = await fetch(detailUrl, { method: "GET" });
  if (!detailResponse.ok) return null;
  const detailHtml = await detailResponse.text();

  const parsedTitle =
    readMeta(detailHtml, "og:title", "property") ??
    (() => {
      const titleMatch = detailHtml.match(/<h1[^>]*class="[^"]*book__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
      return titleMatch?.[1] ? stripTags(titleMatch[1]) : undefined;
    })();

  const authorMatch = detailHtml.match(/class="[^"]*authorLink[^"]*"[^>]*>([^<]+)</i);
  const parsedAuthor = authorMatch?.[1] ? cleanText(authorMatch[1]) : undefined;

  const parsedDescription =
    readMeta(detailHtml, "description", "name") ??
    (() => {
      const descriptionMatch = detailHtml.match(
        /class="[^"]*collapse-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      );
      return descriptionMatch?.[1] ? stripTags(descriptionMatch[1]) : undefined;
    })();

  const parsedCover =
    readMeta(detailHtml, "og:image", "property") ??
    (() => {
      const coverMatch = detailHtml.match(/class="[^"]*book-cover[^"]*"[\s\S]*?<img[^>]+src="([^"]+)"/i);
      return coverMatch?.[1];
    })();

  if (!parsedTitle) return null;

  return {
    title: parsedTitle,
    author: parsedAuthor,
    description: parsedDescription,
    coverPath: parsedCover,
    source: "LUBIMYCZYTAC"
  };
};

const getRanobedbMetadata = async (
  title: string,
  author?: string
): Promise<MetadataResult | null> => {
  const query = toQuery(title, author);
  const searchUrl = new URL("https://ranobedb.org/api/v0/books");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("query", query);
  searchUrl.searchParams.set("limit", "1");
  searchUrl.searchParams.set("rl", "en");
  searchUrl.searchParams.set("rll", "or");
  searchUrl.searchParams.set("rf", "digital,print");
  searchUrl.searchParams.set("rfl", "or");

  const searchResponse = await fetch(searchUrl, {
    method: "GET",
    headers: {
      "user-agent": "BookLite/1.0 (+https://github.com/booklore-app/booklore)"
    }
  });
  if (!searchResponse.ok) return null;

  const searchJson = (await searchResponse.json()) as {
    books?: Array<{ id?: number }>;
  };
  const bookId = searchJson.books?.[0]?.id;
  if (!bookId) return null;

  const detailResponse = await fetch(`https://ranobedb.org/api/v0/book/${bookId}`, {
    method: "GET",
    headers: {
      "user-agent": "BookLite/1.0 (+https://github.com/booklore-app/booklore)"
    }
  });
  if (!detailResponse.ok) return null;

  const detailJson = (await detailResponse.json()) as {
    book?: {
      title?: string;
      romaji?: string;
      description?: string;
      image?: { filename?: string };
      editions?: Array<{
        staff?: Array<{ role_type?: string; romaji?: string; name?: string }>;
      }>;
    };
  };

  const book = detailJson.book;
  if (!book?.title && !book?.romaji) return null;

  const authorName = book?.editions
    ?.flatMap((edition) => edition.staff ?? [])
    .find((staff) => staff.role_type === "author");

  return {
    title: book.title ?? book.romaji,
    author: authorName?.romaji ?? authorName?.name,
    description: book.description,
    coverPath: book.image?.filename
      ? `https://images.ranobedb.org/${book.image.filename}`
      : undefined,
    source: "RANOBEDB"
  };
};

const getComicvineMetadata = async (
  title: string,
  author: string | undefined,
  apiKey: string
): Promise<MetadataResult | null> => {
  if (!apiKey) return null;

  const searchUrl = new URL("https://comicvine.gamespot.com/api/search/");
  searchUrl.searchParams.set("api_key", apiKey);
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("resources", "volume,issue");
  searchUrl.searchParams.set("query", toQuery(title, author));
  searchUrl.searchParams.set("limit", "1");
  searchUrl.searchParams.set("field_list", "name,deck,description,image,person_credits");

  const response = await fetch(searchUrl, {
    method: "GET",
    headers: {
      "user-agent": "BookLite/1.0 (+https://github.com/booklore-app/booklore)"
    }
  });
  if (!response.ok) return null;

  const json = (await response.json()) as {
    results?: Array<{
      name?: string;
      deck?: string;
      description?: string;
      image?: {
        original_url?: string;
        super_url?: string;
        small_url?: string;
      };
      person_credits?: Array<{ name?: string; role?: string }>;
    }>;
  };

  const result = json.results?.[0];
  if (!result?.name) return null;

  const authorCredit = result.person_credits?.find((p) =>
    /writer|author/i.test(p.role ?? "")
  );

  return {
    title: result.name,
    author: authorCredit?.name,
    description: result.deck ?? (result.description ? stripTags(result.description) : undefined),
    coverPath:
      result.image?.original_url ?? result.image?.super_url ?? result.image?.small_url,
    source: "COMICVINE"
  };
};

const getAudibleMetadata = async (
  title: string,
  author: string | undefined,
  domain: string
): Promise<MetadataResult | null> => {
  const searchUrl = new URL(`https://www.audible.${domain}/search`);
  searchUrl.searchParams.set("keywords", toQuery(title, author));

  const headers: Record<string, string> = {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9"
  };

  const searchResponse = await fetch(searchUrl, { method: "GET", headers });
  if (!searchResponse.ok) return null;
  const searchHtml = await searchResponse.text();

  const asinMatch = searchHtml.match(/\/pd\/([A-Z0-9]{10})/i);
  if (!asinMatch) return null;

  const detailUrl = `https://www.audible.${domain}/pd/${asinMatch[1]}`;
  const detailResponse = await fetch(detailUrl, { method: "GET", headers });
  if (!detailResponse.ok) return null;
  const detailHtml = await detailResponse.text();

  const scripts = detailHtml.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>\s*([\s\S]*?)\s*<\/script>/gi
  );

  let parsedTitle: string | undefined;
  let parsedAuthor: string | undefined;
  let parsedDescription: string | undefined;
  let parsedCover: string | undefined;

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1]) as unknown;
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        const type = String(record["@type"] ?? "");
        if (type !== "Audiobook" && type !== "Product") continue;

        if (!parsedTitle && typeof record.name === "string") {
          parsedTitle = cleanText(record.name);
        }
        if (!parsedDescription && typeof record.description === "string") {
          parsedDescription = cleanText(record.description);
        }
        if (!parsedCover) {
          if (typeof record.image === "string") parsedCover = record.image;
          if (
            Array.isArray(record.image) &&
            record.image.length > 0 &&
            typeof record.image[0] === "string"
          ) {
            parsedCover = record.image[0];
          }
        }
        if (!parsedAuthor) {
          const authorField = record.author;
          if (Array.isArray(authorField) && authorField.length > 0) {
            const first = authorField[0] as Record<string, unknown>;
            if (typeof first?.name === "string") parsedAuthor = cleanText(first.name);
          } else if (
            authorField &&
            typeof authorField === "object" &&
            typeof (authorField as Record<string, unknown>).name === "string"
          ) {
            parsedAuthor = cleanText((authorField as Record<string, string>).name);
          }
        }
      }
    } catch {
      // ignore malformed blocks
    }
  }

  if (!parsedTitle) {
    parsedTitle = readMeta(detailHtml, "og:title", "property");
  }

  if (!parsedTitle) return null;

  return {
    title: parsedTitle,
    author: parsedAuthor,
    description: parsedDescription,
    coverPath: parsedCover,
    source: "AUDIBLE"
  };
};

export const fetchMetadataWithFallback = async (
  title: string,
  author?: string
): Promise<MetadataResult> => {
  const settings = await resolveMetadataProviderSettings();

  for (const provider of settings.providerOrder) {
    if (provider === "open_library") {
      const result = await getOpenLibraryMetadata(title, author);
      if (result) return result;
      continue;
    }

    if (provider === "amazon") {
      const result = await getAmazonMetadata(
        title,
        author,
        settings.amazonDomain || "com",
        settings.amazonCookie
      );
      if (result) return result;
      continue;
    }

    if (provider === "google") {
      const result = await getGoogleMetadata(
        title,
        author,
        settings.googleApiKey,
        settings.googleLanguage
      );
      if (result) return result;
      continue;
    }

    if (provider === "hardcover") {
      const result = await getHardcoverMetadata(
        title,
        author,
        settings.hardcoverApiKey
      );
      if (result) return result;
      continue;
    }

    if (provider === "goodreads") {
      const result = await getGoodreadsMetadata(title, author);
      if (result) return result;
      continue;
    }

    if (provider === "douban") {
      const result = await getDoubanMetadata(title, author);
      if (result) return result;
      continue;
    }

    if (provider === "lubimyczytac") {
      const result = await getLubimyczytacMetadata(title, author);
      if (result) return result;
      continue;
    }

    if (provider === "ranobedb") {
      const result = await getRanobedbMetadata(title, author);
      if (result) return result;
      continue;
    }

    if (provider === "comicvine") {
      const result = await getComicvineMetadata(
        title,
        author,
        settings.comicvineApiKey
      );
      if (result) return result;
      continue;
    }

    if (provider === "audible") {
      const result = await getAudibleMetadata(
        title,
        author,
        settings.audibleDomain || "com"
      );
      if (result) return result;
    }
  }

  return { source: "NONE" };
};
