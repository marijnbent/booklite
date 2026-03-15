import type { MetadataResult } from "../types";
import { extractSeriesFromTitle } from "../series";
import { hasText, isSpamTitle, similarityScore, toQuery } from "../text";

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
  const rc = doc.ratings_count ?? 0;
  if (rc > 100) completeness += 0.2;
  else if (rc > 0) completeness += 0.1;

  return titleScore * 0.5 + authorScore * 0.3 + completeness * 0.2;
};

export const getHardcoverMetadata = async (
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
    series = best.series_position ? `${seriesName} #${best.series_position}` : seriesName;
  }
  if (!series && hasText(best.title)) {
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
