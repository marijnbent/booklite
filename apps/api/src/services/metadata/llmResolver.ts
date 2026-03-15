import { callOpenRouterJsonObject } from "../openrouter";
import { logAdminActivity } from "../adminActivityLog";
import {
  resolveCoverFromProviders,
  resolveDescriptionFromProviders
} from "./scoring";
import { cleanText, hasText, toOptionalText, truncateForPrompt } from "./text";
import type { MetadataResult, ProviderCandidate } from "./types";

export const resolveWithLlm = async (
  queryTitle: string,
  queryAuthor: string | undefined,
  candidates: ProviderCandidate[],
  apiKey: string,
  model: string
): Promise<MetadataResult | null> => {
  if (!hasText(apiKey) || !hasText(model) || candidates.length === 0) return null;

  const systemMessage = `You are a book metadata resolver. You receive a search query (derived from a filename - this is the source of truth for what the user is looking for) and results from multiple metadata providers.

Your job:
1. The query title and author come from the filename. They define WHICH BOOK the user wants. If a provider returned metadata for the wrong book (e.g. a study guide, a different edition by a different author, or a completely different book), ignore that provider's data entirely.
2. For each field, pick the best value from the providers that matched the correct book. If you believe a provider's value is wrong or inaccurate (e.g. wrong author, wrong series), return the correct value from your own knowledge instead.
3. If NO provider has a field (especially series), fill it from your own knowledge if you are confident.
4. Never fabricate a description or cover URL - only pick from providers or omit.

Return a JSON object with exactly these fields (omit or null any field you cannot determine):
{ "title", "author", "series", "description", "coverPath" }

Rules:
- title: The canonical title of the book. Fix casing/spelling if providers got it wrong.
- author: The real author. If providers returned a study guide author or publisher, correct it.
- series: Format as "Series Name #N" (e.g. "The Empyrean #1"). Include position number if known. If the book is standalone, omit or null.
- description: Pick the most relevant and complete description from providers. Do not write your own.
- coverPath: Pick the best cover URL from providers. Do not generate one.
- Keep title/series in the same language/script as the query and matched provider records.
- Never translate the title or series into a different language.`;

  const providerRows = candidates
    .map((candidate, index) => {
      const metadata = candidate.metadata;
      const descriptionSnippet = hasText(metadata.description)
        ? truncateForPrompt(cleanText(metadata.description), 200)
        : "";
      const coverFlag = hasText(metadata.coverPath) ? "yes" : "no";
      const coverValue = hasText(metadata.coverPath) ? metadata.coverPath : "";

      return `${index + 1}. [${candidate.provider}] title=${JSON.stringify(metadata.title ?? "")} author=${JSON.stringify(metadata.author ?? "")} series=${JSON.stringify(metadata.series ?? "")} description=${JSON.stringify(descriptionSnippet)} cover=${coverFlag} coverPath=${JSON.stringify(coverValue)}`;
    })
    .join("\n");

  const userMessage = `Query: title=${JSON.stringify(queryTitle)}, author=${JSON.stringify(queryAuthor ?? "")}

Provider results:
${providerRows}`;

  try {
    const parsed = await callOpenRouterJsonObject({
      apiKey,
      model,
      systemMessage,
      userMessage,
      timeoutMs: 15000
    });
    if (!parsed) return null;

    const title = toOptionalText(parsed.title);
    const author = toOptionalText(parsed.author);
    const series = toOptionalText(parsed.series);
    const description = resolveDescriptionFromProviders(
      candidates,
      toOptionalText(parsed.description),
      queryAuthor
    );
    const coverPath = resolveCoverFromProviders(candidates, toOptionalText(parsed.coverPath));

    if (!hasText(title) && !hasText(author) && !hasText(series) && !description && !coverPath) {
      return null;
    }

    return {
      source: "NONE",
      title,
      author,
      series,
      description,
      coverPath
    };
  } catch (error) {
    await logAdminActivity({
      scope: "metadata",
      event: "metadata.openrouter_resolution_failed",
      message: "OpenRouter metadata resolution failed",
      details: {
        title: queryTitle,
        author: queryAuthor,
        model,
        candidateProviders: candidates.map((candidate) => candidate.provider),
        error
      }
    });
    return null;
  }
};
