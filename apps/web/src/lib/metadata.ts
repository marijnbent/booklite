export type MetadataSource =
  | "OPEN_LIBRARY"
  | "AMAZON"
  | "GOOGLE"
  | "HARDCOVER"
  | "GOODREADS"
  | "DOUBAN"
  | "NONE";

export interface MetadataCoverOption {
  coverPath: string;
  source: Exclude<MetadataSource, "NONE">;
}

export const sourceLabel = (source: string | null | undefined): string => {
  if (source === "OPEN_LIBRARY") return "Open Library";
  if (source === "AMAZON") return "Amazon";
  if (source === "GOOGLE") return "Google Books";
  if (source === "HARDCOVER") return "Hardcover";
  if (source === "GOODREADS") return "Goodreads";
  if (source === "DOUBAN") return "Douban";
  return "Metadata";
};
