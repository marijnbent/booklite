import { config } from "../config";

export interface MetadataResult {
  title?: string;
  author?: string;
  description?: string;
  coverPath?: string;
  source: "OPEN_LIBRARY" | "GOOGLE" | "NONE";
}

const toQuery = (title: string, author?: string): string => {
  const parts = [title.trim()];
  if (author?.trim()) parts.push(author.trim());
  return parts.join(" ");
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
  author?: string
): Promise<MetadataResult | null> => {
  const q = [title ? `intitle:${title}` : "", author ? `inauthor:${author}` : ""]
    .filter(Boolean)
    .join("+");

  const searchUrl = new URL("https://www.googleapis.com/books/v1/volumes");
  searchUrl.searchParams.set("q", q || title);
  searchUrl.searchParams.set("maxResults", "3");
  if (config.googleBooksApiKey) {
    searchUrl.searchParams.set("key", config.googleBooksApiKey);
  }

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

export const fetchMetadataWithFallback = async (
  title: string,
  author?: string
): Promise<MetadataResult> => {
  const openLibrary = await getOpenLibraryMetadata(title, author);
  if (openLibrary) return openLibrary;

  const google = await getGoogleMetadata(title, author);
  if (google) return google;

  return { source: "NONE" };
};
