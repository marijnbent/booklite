import type { MetadataResult } from "../types";
import {
  extractSeriesFromTitle,
  hasText,
  isSpamTitle,
  similarityScore,
  toQuery
} from "../utils";

type GoogleVolumeInfo = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  description?: string;
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  seriesInfo?: { bookDisplayNumber?: string; shortSeriesBookTitle?: string };
};

const scoreVolumeInfo = (
  volume: GoogleVolumeInfo,
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

export const getGoogleMetadata = async (
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
