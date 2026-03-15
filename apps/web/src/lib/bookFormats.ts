const browserReadableBookExts = ["epub", "kepub"] as const;
const uploadableBookExts = ["epub", "kepub", "pdf"] as const;

export const isBrowserReadableBookExt = (ext: string): boolean =>
  browserReadableBookExts.includes(ext.toLowerCase() as (typeof browserReadableBookExts)[number]);

export const isUploadableBookName = (name: string): boolean =>
  uploadableBookExts.some((ext) => name.toLowerCase().endsWith(`.${ext}`));

export const toInitialBookTitle = (name: string): string =>
  name.replace(/\.(?:kepub\.)?(?:epub|pdf)$/i, "").replace(/\.(?:kepub)$/i, "");
