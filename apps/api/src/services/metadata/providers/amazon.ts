import type { MetadataResult } from "../types";
import { extractSeriesFromTitle, readMeta, stripTags, toQuery } from "../utils";

const extractAmazonSeries = (detailHtml: string, titleText?: string): string | undefined => {
  const bookOfMatch = detailHtml.match(
    /id="seriesBullet"[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?Book\s+(\d+)\s+of/i
  );
  if (bookOfMatch) {
    return `${stripTags(bookOfMatch[1])} #${bookOfMatch[2]}`;
  }

  if (titleText) {
    const extracted = extractSeriesFromTitle(titleText);
    if (extracted.series) return extracted.series;
  }

  const standaloneMatch = detailHtml.match(/Book\s+(\d+)\s+of\s+\d+/);
  if (standaloneMatch) {
    const metaTitle = readMeta(detailHtml, "og:title", "property") ?? "";
    const metaExtracted = extractSeriesFromTitle(metaTitle);
    if (metaExtracted.series) return metaExtracted.series;
  }

  return undefined;
};

export const getAmazonMetadata = async (
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
