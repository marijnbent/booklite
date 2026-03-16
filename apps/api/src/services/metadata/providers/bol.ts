import type { MetadataResult } from "../types";
import { extractSeriesFromTitle } from "../series";
import {
  absoluteUrl,
  cleanText,
  hasText,
  isSpamTitle,
  similarityScore,
  stripTags,
  toQuery
} from "../text";

const extractBolSeries = (detailHtml: string): string | undefined => {
  const match =
    detailHtml.match(/aria-label="Serie:\s*([^"]+)"/i) ??
    detailHtml.match(/>\s*Serie:\s*<\/span>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
  return match?.[1] ? stripTags(match[1]) : undefined;
};

const extractBolSeriesFromTitle = (
  rawTitle: string
): { cleanTitle: string; series: string | undefined } => {
  const prefixedSeriesMatch = rawTitle.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*[-:–—]\s+(.+)$/);
  if (prefixedSeriesMatch) {
    return {
      cleanTitle: prefixedSeriesMatch[3].trim(),
      series: `${prefixedSeriesMatch[1].trim()} #${prefixedSeriesMatch[2]}`
    };
  }

  const extracted = extractSeriesFromTitle(rawTitle);
  return {
    cleanTitle: extracted.cleanTitle,
    series: extracted.series ?? undefined
  };
};

interface BolLdImage {
  url?: string;
}

interface BolLdOfferSeller {
  name?: string;
}

interface BolLdOffer {
  price?: string;
  priceCurrency?: string;
  availability?: string;
  seller?: BolLdOfferSeller;
}

interface BolLdWorkExample {
  url?: string;
  name?: string;
  description?: string;
  ["@description"]?: string;
  bookFormat?: string;
  isbn?: string;
  numberOfPages?: string;
  datePublished?: string;
  offers?: BolLdOffer;
}

interface BolLdBookProduct {
  ["@type"]?: string | string[];
  name?: string;
  description?: string;
  image?: string | BolLdImage;
  url?: string;
  inLanguage?: string;
  bookEdition?: string;
  author?: { name?: string };
  publisher?: { name?: string };
  workExample?: BolLdWorkExample[];
}

const parseJsonScriptBlocks = (html: string): unknown[] => {
  const scripts = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi) ?? [];
  const values: unknown[] = [];

  for (const script of scripts) {
    const body = script
      .replace(/^<script type="application\/ld\+json">/i, "")
      .replace(/<\/script>$/i, "")
      .trim();
    if (!body) continue;

    try {
      values.push(JSON.parse(body));
    } catch {
      continue;
    }
  }

  return values;
};

const isBolBookProduct = (value: unknown): value is BolLdBookProduct => {
  if (!value || typeof value !== "object") return false;

  const entry = value as BolLdBookProduct;
  const types = Array.isArray(entry["@type"]) ? entry["@type"] : [entry["@type"]];
  return types.includes("Book") && types.includes("Product");
};

const extractBolProductId = (value: string): string | null => {
  const match = value.match(/\/(\d{10,})\/?$/);
  return match?.[1] ?? null;
};

const getBolImageUrl = (image: string | BolLdImage | undefined): string | undefined => {
  if (typeof image === "string") return image;
  return image?.url;
};

const getBolDescription = (
  detail: BolLdBookProduct,
  matchedWorkExample: BolLdWorkExample | undefined
): string | undefined => {
  const rawDescription =
    matchedWorkExample?.description ??
    matchedWorkExample?.["@description"] ??
    detail.description;

  return hasText(rawDescription) ? stripTags(rawDescription) : undefined;
};

const extractBolAuthor = (detailHtml: string): string | undefined => {
  const match =
    detailHtml.match(/aria-label="Auteur:\s*([^"]+)"/i) ??
    detailHtml.match(/>\s*Auteur:\s*<\/span>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
  return match?.[1] ? stripTags(match[1]) : undefined;
};

const extractBolCandidates = (searchHtml: string): string[] => {
  const matches = searchHtml.match(/href="([^"]*\/nl\/nl\/p\/[^"]+\/\d+\/)"/gi) ?? [];
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const match of matches) {
    const hrefMatch = match.match(/href="([^"]+)"/i);
    const href = hrefMatch?.[1];
    if (!href) continue;

    const absolute = absoluteUrl("https://www.bol.com", href);
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    candidates.push(absolute);
  }

  return candidates;
};

const scoreBolSearchCandidate = (candidateUrl: string, queryTitle: string): number => {
  const match = candidateUrl.match(/\/nl\/nl\/p\/([^/]+)\/\d+\/?$/i);
  const slug = match?.[1];
  if (!slug) return 0;
  return similarityScore(queryTitle, slug.replace(/-/g, " "));
};

const parseBolDetailMetadata = (
  detailHtml: string,
  detailUrl: string
): MetadataResult | null => {
  const bookProduct = parseJsonScriptBlocks(detailHtml).find(isBolBookProduct);
  if (!bookProduct) return null;

  const detailProductId = extractBolProductId(detailUrl);
  const matchedWorkExample =
    bookProduct.workExample?.find((entry) => {
      if (!entry.url || !detailProductId) return false;
      return extractBolProductId(entry.url) === detailProductId;
    }) ?? bookProduct.workExample?.[0];

  const rawTitle = matchedWorkExample?.name ?? bookProduct.name;
  if (!hasText(rawTitle)) return null;

  const extractedSeries = extractBolSeries(detailHtml);
  const titleSeries = extractBolSeriesFromTitle(rawTitle);
  const series = extractedSeries ?? titleSeries.series;
  const title = series ? titleSeries.cleanTitle : rawTitle;

  return {
    title: cleanText(title),
    author: extractBolAuthor(detailHtml) ?? bookProduct.author?.name,
    series,
    description: getBolDescription(bookProduct, matchedWorkExample),
    coverPath: getBolImageUrl(bookProduct.image),
    source: "BOL"
  };
};

const scoreBolDetail = (
  result: MetadataResult,
  queryTitle: string,
  queryAuthor?: string
): number => {
  if (isSpamTitle(result.title, queryTitle)) return -1;

  const titleScore = similarityScore(queryTitle, result.title);
  const authorScore = similarityScore(queryAuthor, result.author);

  let completeness = 0;
  if (hasText(result.description)) completeness += 0.35;
  if (hasText(result.coverPath)) completeness += 0.35;
  if (hasText(result.author)) completeness += 0.2;
  if (hasText(result.series)) completeness += 0.1;

  return titleScore * 0.56 + authorScore * 0.3 + completeness * 0.14;
};

export const getBolMetadata = async (
  title: string,
  author?: string
): Promise<MetadataResult | null> => {
  const searchUrl = new URL("https://www.bol.com/nl/nl/s/");
  searchUrl.searchParams.set("searchtext", toQuery(title, author));
  searchUrl.searchParams.set("N", "8299");

  const headers = {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "accept-language": "nl-NL,nl;q=0.9,en;q=0.8"
  };

  const searchResponse = await fetch(searchUrl, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(10000)
  });
  if (!searchResponse.ok) return null;
  const searchHtml = await searchResponse.text();

  const candidates = extractBolCandidates(searchHtml)
    .map((url) => ({ url, score: scoreBolSearchCandidate(url, title) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (candidates.length === 0) return null;

  const settled = await Promise.allSettled(
    candidates.map(async ({ url }) => {
      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return null;

      const detailHtml = await response.text();
      return parseBolDetailMetadata(detailHtml, url);
    })
  );

  const best = settled
    .filter(
      (entry): entry is PromiseFulfilledResult<MetadataResult | null> => entry.status === "fulfilled"
    )
    .map((entry) => entry.value)
    .filter((entry): entry is MetadataResult => Boolean(entry))
    .map((entry) => ({ entry, score: scoreBolDetail(entry, title, author) }))
    .sort((a, b) => b.score - a.score)[0]?.entry;

  return best ?? null;
};
