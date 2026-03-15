export const toQuery = (title: string, author?: string): string => {
  const parts = [title.trim()];
  if (author?.trim()) parts.push(author.trim());
  return parts.join(" ");
};

export const normalizeUrl = (url: string): string => url.replace(/\\\//g, "/");

export const absoluteUrl = (base: string, href: string): string =>
  href.startsWith("http") ? href : new URL(href, base).toString();

export const cleanText = (value: string): string =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

export const stripTags = (value: string): string => cleanText(value.replace(/<[^>]*>/g, " "));

export const normalizeForMatch = (value: string): string =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokenize = (value: string): string[] =>
  normalizeForMatch(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

export const diceCoefficient = (query: string, candidate: string): number => {
  const queryTokens = new Set(tokenize(query));
  const candidateTokens = new Set(tokenize(candidate));
  if (queryTokens.size === 0 || candidateTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) intersection += 1;
  }

  return (2 * intersection) / (queryTokens.size + candidateTokens.size);
};

export const similarityScore = (
  query: string | undefined,
  candidate: string | undefined
): number => {
  if (!query || !candidate) return 0;

  const q = normalizeForMatch(query);
  const c = normalizeForMatch(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.92;

  return diceCoefficient(q, c);
};

export const readMeta = (
  html: string,
  key: string,
  type: "property" | "name"
): string | undefined => {
  const match = html.match(
    new RegExp(`<meta[^>]+${type}="${key}"[^>]+content="([^"]+)"`, "i")
  );
  return match?.[1] ? cleanText(match[1]) : undefined;
};

export const getFirstMatch = (html: string, patterns: RegExp[]): string | null => {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return normalizeUrl(match[1]);
  }
  return null;
};

export const hasText = (value: string | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const SPAM_TITLE_PATTERN =
  /\b(summary|study\s*guide|workbook|analysis|cliff\s*notes|sparknotes|book\s*companion)\b/i;

export const isSpamTitle = (title: string | undefined, queryTitle: string): boolean => {
  if (!title) return false;
  if (SPAM_TITLE_PATTERN.test(queryTitle)) return false;
  return SPAM_TITLE_PATTERN.test(title);
};

export const truncateForPrompt = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
};

export const toOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};
