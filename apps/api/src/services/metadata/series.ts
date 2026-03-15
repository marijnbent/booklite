export const extractSeriesFromTitle = (
  rawTitle: string
): { cleanTitle: string; series: string | null } => {
  const parenMatch = rawTitle.match(/^(.+?)\s*\(([^)]+?),?\s*#?(\d+(?:\.\d+)?)\)\s*$/);
  if (parenMatch) {
    return {
      cleanTitle: parenMatch[1].trim(),
      series: `${parenMatch[2].trim()} #${parenMatch[3]}`
    };
  }

  const parenNoNum = rawTitle.match(/^(.+?)\s*\(([^)]{3,})\)\s*$/);
  if (parenNoNum && !/edition|vol|book/i.test(parenNoNum[2])) {
    return { cleanTitle: parenNoNum[1].trim(), series: parenNoNum[2].trim() };
  }

  const suffixMatch = rawTitle.match(/^(.+?)\s*[-:–—]\s+(.+?)\s*#(\d+(?:\.\d+)?)\s*$/);
  if (suffixMatch) {
    return {
      cleanTitle: suffixMatch[1].trim(),
      series: `${suffixMatch[2].trim()} #${suffixMatch[3]}`
    };
  }

  return { cleanTitle: rawTitle, series: null };
};
