import type { MetadataResult } from "../types";
import {
  extractSeriesFromTitle,
  hasText,
  isSpamTitle,
  similarityScore,
  toQuery
} from "../utils";

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

export const getOpenLibraryMetadata = async (
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

  if (!series && hasText(bestDoc.title)) {
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
