import type { MetadataCoverOption, MetadataSource } from "@booklite/shared";

export type { MetadataCoverOption, MetadataSource } from "@booklite/shared";

export const sourceLabel = (source: string | null | undefined): string => {
  if (source === "OPEN_LIBRARY") return "Open Library";
  if (source === "AMAZON") return "Amazon";
  if (source === "BOL") return "bol.com";
  if (source === "GOOGLE") return "Google Books";
  if (source === "HARDCOVER") return "Hardcover";
  if (source === "GOODREADS") return "Goodreads";
  if (source === "DOUBAN") return "Douban";
  return "Metadata";
};

