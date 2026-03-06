import path from "node:path";
import { config } from "../config";
import { getSetting } from "../db/client";
import { filenameToBasicMetadata, ParsedFilename } from "./books";
import { callOpenRouterJsonObject } from "./openrouter";

interface FilenameAiSettings {
  openrouterEnabled: boolean;
  openrouterApiKey: string;
  openrouterModel: string;
}

const hasText = (value: string | undefined | null): value is string =>
  typeof value === "string" && value.trim().length > 0;

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const containsUrl = (value: string): boolean => /https?:\/\//i.test(value);

const toOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeSeriesText = (value: string): string => {
  const normalized = normalizeWhitespace(value);

  const bookPattern = normalized.match(/^(.+?),\s*Book\s+(\d+(?:\.\d+)?)$/i);
  if (bookPattern) {
    return `${normalizeWhitespace(bookPattern[1])} #${bookPattern[2]}`;
  }

  return normalized;
};

const sanitizeTitle = (value: unknown): string | undefined => {
  const text = toOptionalText(value);
  if (!text) return undefined;
  if (containsUrl(text)) return undefined;
  if (text.length < 1 || text.length > 200) return undefined;
  return text;
};

const sanitizeAuthor = (value: unknown): string | undefined => {
  const text = toOptionalText(value);
  if (!text) return undefined;
  if (containsUrl(text)) return undefined;
  return text;
};

const sanitizeSeries = (value: unknown): string | undefined => {
  const text = toOptionalText(value);
  if (!text) return undefined;
  if (containsUrl(text)) return undefined;
  return normalizeSeriesText(text);
};

export const resolveFilenameAiSettings = async (): Promise<FilenameAiSettings> => ({
  openrouterEnabled: await getSetting<boolean>("metadata_openrouter_enabled", false),
  openrouterApiKey: (
    (await getSetting<string>("metadata_openrouter_api_key", config.openrouterApiKey ?? "")) ??
    ""
  ).trim(),
  openrouterModel: (
    (await getSetting<string>("metadata_openrouter_model", "")) ?? ""
  ).trim()
});

export const isLowConfidenceFilenameParse = (
  fileName: string,
  parsed: ParsedFilename
): boolean => {
  const rawBase = path.parse(fileName).name.toLowerCase();
  const normalizedTitle = parsed.title.toLowerCase();

  let score = 0;

  if (/(?:\blibgen\b|z-lib|zlibrary|\banna\b|\barchive\b|\bisbn\b|\bepub\b|\bpdf\b|\bmobi\b)/i.test(normalizedTitle)) {
    score += 2;
  }

  if (/\b[0-9a-f]{16,}\b/i.test(normalizedTitle) || /\d{5,}/.test(normalizedTitle)) {
    score += 2;
  }

  if (parsed.title.length < 3 || parsed.title.length > 140) {
    score += 1;
  }

  if ((rawBase.includes(" - ") || /\sby\s/i.test(rawBase)) && !hasText(parsed.author)) {
    score += 1;
  }

  if (hasText(parsed.title)) {
    const nonAlnumCount = parsed.title.split("").filter((ch) => !/[A-Za-z0-9\s]/.test(ch)).length;
    const ratio = nonAlnumCount / parsed.title.length;
    if (ratio > 0.35) {
      score += 1;
    }
  }

  return score >= 2;
};

export const normalizeFilenameWithLlm = async (
  fileName: string,
  parsed: ParsedFilename,
  apiKey: string,
  model: string
): Promise<Partial<ParsedFilename> | null> => {
  if (!hasText(apiKey) || !hasText(model)) return null;

  const systemMessage = `You are a filename metadata normalizer for books.
You receive a raw filename and a deterministic parser output.
Infer corrections from the filename only.

Rules:
- Return JSON object with optional keys: title, author, series.
- Remove source/publisher/hash/ISBN/noise clutter from fields.
- series format must be \"Series Name #N\" when a number is known.
- Do not fabricate uncertain data. Omit fields you are not confident about.
- Never include URLs.`;

  const userMessage = `Raw filename: ${JSON.stringify(fileName)}
Deterministic parse:
${JSON.stringify(parsed, null, 2)}`;

  const llmObject = await callOpenRouterJsonObject({
    apiKey,
    model,
    systemMessage,
    userMessage,
    timeoutMs: 10000
  });

  if (!llmObject) return null;

  const title = sanitizeTitle(llmObject.title);
  const author = sanitizeAuthor(llmObject.author);
  const series = sanitizeSeries(llmObject.series);

  if (!title && !author && !series) return null;

  return {
    ...(title ? { title } : {}),
    ...(author ? { author } : {}),
    ...(series ? { series } : {})
  };
};

export const resolveFilenameMetadata = async (fileName: string): Promise<ParsedFilename> => {
  const parsed = filenameToBasicMetadata(fileName);

  if (!isLowConfidenceFilenameParse(fileName, parsed)) {
    return parsed;
  }

  const settings = await resolveFilenameAiSettings();
  if (
    !settings.openrouterEnabled ||
    !hasText(settings.openrouterApiKey) ||
    !hasText(settings.openrouterModel)
  ) {
    return parsed;
  }

  const llmResult = await normalizeFilenameWithLlm(
    fileName,
    parsed,
    settings.openrouterApiKey,
    settings.openrouterModel
  );

  if (!llmResult) {
    return parsed;
  }

  return {
    title: llmResult.title ?? parsed.title,
    author: llmResult.author ?? parsed.author,
    series: llmResult.series ?? parsed.series
  };
};
