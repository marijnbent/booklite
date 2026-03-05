import path from "node:path";

export const isSupportedBookExt = (ext: string): boolean =>
  ["epub", "pdf"].includes(ext.toLowerCase());

export const filenameToBasicMetadata = (
  fileName: string
): { title: string; author: string | null } => {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim();
  const byDash = baseName.split("-").map((chunk) => chunk.trim()).filter(Boolean);

  if (byDash.length >= 2) {
    return {
      author: byDash[0],
      title: byDash.slice(1).join(" - ")
    };
  }

  return {
    title: baseName || path.parse(fileName).name,
    author: null
  };
};
