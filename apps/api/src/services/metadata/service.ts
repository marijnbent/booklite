import {
  buildCandidate,
  buildCoverOptions,
  hasUsableMetadata,
  isStrongBookMatchCandidate,
  selectBestCoverPath,
  selectBestField
} from "./scoring";
import { resolveMetadataProviderSettings } from "./settings";
import { resolveWithLlm } from "./llmResolver";
import { buildProviderFetchOrder, providerFetchers } from "./providers";
import { hasText } from "./text";
import type { MetadataPreviewResult, MetadataResult, ProviderCandidate } from "./types";
import { logAdminActivity } from "../adminActivityLog";

const resolveMetadata = async (
  title: string,
  author?: string
): Promise<{ result: MetadataResult; candidates: ProviderCandidate[] }> => {
  const settings = await resolveMetadataProviderSettings();
  const providerOrder = buildProviderFetchOrder(settings.providerEnabled);

  if (providerOrder.length === 0) {
    return { result: { source: "NONE" }, candidates: [] };
  }

  const results = await Promise.allSettled(
    providerOrder.map(async (provider) => {
      const fetcher = providerFetchers[provider];
      if (!fetcher) return { provider, result: null as MetadataResult | null };
      const result = await fetcher(title, author, settings);
      return { provider, result };
    })
  );

  const candidates: ProviderCandidate[] = [];

  for (const [index, settled] of results.entries()) {
    if (settled.status !== "fulfilled") {
      const provider = providerOrder[index];
      await logAdminActivity({
        scope: "metadata",
        event: "metadata.provider_failed",
        message: "Metadata provider request failed",
        details: {
          title,
          author,
          provider,
          error: settled.reason
        }
      });
      continue;
    }

    const { provider, result } = settled.value;
    if (!result || !hasUsableMetadata(result)) continue;
    candidates.push(buildCandidate(provider, result, title, author));
  }

  if (candidates.length === 0) {
    return { result: { source: "NONE" }, candidates: [] };
  }

  candidates.sort((a, b) => b.overallScore - a.overallScore);
  const bestSource = candidates[0].metadata.source;

  if (
    settings.openrouterEnabled &&
    hasText(settings.openrouterApiKey) &&
    hasText(settings.openrouterModel)
  ) {
    const llmResolved = await resolveWithLlm(
      title,
      author,
      candidates,
      settings.openrouterApiKey,
      settings.openrouterModel
    );

    if (llmResolved) {
      return {
        result: {
          ...llmResolved,
          source: bestSource
        },
        candidates
      };
    }
  }

  const mergedTitle = selectBestField(
    candidates,
    (metadata) => metadata.title,
    (candidate) =>
      candidate.titleScore * 0.75 + candidate.trust * 0.15 + candidate.completeness * 0.1
  );
  const mergedAuthor = selectBestField(
    candidates,
    (metadata) => metadata.author,
    (candidate) =>
      isStrongBookMatchCandidate(candidate, author)
        ? candidate.authorScore * 0.75 + candidate.trust * 0.15 + candidate.completeness * 0.1
        : -Infinity
  );
  const mergedSeries = selectBestField(
    candidates,
    (metadata) => metadata.series,
    (candidate) =>
      candidate.titleScore * 0.4 +
      candidate.trust * 0.3 +
      candidate.completeness * 0.3
  );
  const mergedDescription = selectBestField(
    candidates,
    (metadata) => metadata.description,
    (candidate) =>
      isStrongBookMatchCandidate(candidate, author)
        ? candidate.completeness * 0.5 +
          candidate.titleScore * 0.2 +
          candidate.authorScore * 0.1 +
          candidate.trust * 0.2
        : -Infinity
  );
  const mergedCoverPath = selectBestCoverPath(candidates, author);

  if (
    !hasText(mergedTitle) &&
    !hasText(mergedAuthor) &&
    !hasText(mergedDescription) &&
    !hasText(mergedCoverPath)
  ) {
    return { result: { source: "NONE" }, candidates };
  }

  return {
    result: {
      source: bestSource,
      title: mergedTitle,
      author: mergedAuthor,
      series: mergedSeries,
      description: mergedDescription,
      coverPath: mergedCoverPath
    },
    candidates
  };
};

export const fetchMetadataWithFallback = async (
  title: string,
  author?: string
): Promise<MetadataResult> => {
  const { result } = await resolveMetadata(title, author);
  return result;
};

export const fetchMetadataPreview = async (
  title: string,
  author?: string
): Promise<MetadataPreviewResult> => {
  const { result, candidates } = await resolveMetadata(title, author);

  return {
    ...result,
    coverOptions: buildCoverOptions(candidates, result.coverPath, author)
  };
};
