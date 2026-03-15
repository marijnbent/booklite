import type { MetadataResult } from "../types";
import {
  absoluteUrl,
  cleanText,
  hasText,
  isSpamTitle,
  normalizeUrl,
  readMeta,
  similarityScore,
  SPAM_TITLE_PATTERN,
  stripTags,
  toQuery
} from "../text";

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

const extractGoodreadsSeries = (detailHtml: string): string | undefined => {
  const seriesMatch = detailHtml.match(/"Series:[^"]*":\{[^}]*"title":"([^"]+)"[^}]*\}/);
  const seriesName = seriesMatch?.[1];
  if (!seriesName) return undefined;

  const positionMatch = detailHtml.match(/"bookSeries":\[\{[^}]*"userPosition":"(\d+(?:\.\d+)?)"/);
  const position = positionMatch?.[1];

  return position ? `${seriesName} #${position}` : seriesName;
};

export const getGoodreadsMetadata = async (
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
    const allHrefs = [...searchHtml.matchAll(/href="(\/book\/show\/[^"]+)"/gi)]
      .map((m) => m[1])
      .filter((href, index, arr) => arr.indexOf(href) === index);

    for (const href of allHrefs) {
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
    readMeta(detailHtml, "og:title", "property") ?? readMeta(detailHtml, "title", "name");
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
