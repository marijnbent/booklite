import { coverProviderPreference, providerTrustScore } from "./constants";
import type {
  MetadataCoverOption,
  MetadataProvider,
  MetadataResult,
  ProviderCandidate
} from "./types";
import {
  cleanText,
  hasText,
  normalizeForMatch,
  normalizeUrl,
  similarityScore,
  truncateForPrompt
} from "./text";

const coverProviderPreferenceScore: Record<MetadataProvider, number> = coverProviderPreference.reduce(
  (scores, provider, index) => ({
    ...scores,
    [provider]: 1 - index * 0.08
  }),
  {} as Record<MetadataProvider, number>
);

export const hasUsableMetadata = (result: MetadataResult): boolean =>
  hasText(result.title) ||
  hasText(result.author) ||
  hasText(result.description) ||
  hasText(result.coverPath);

export const metadataCompleteness = (result: MetadataResult): number => {
  let presentFields = 0;
  if (hasText(result.title)) presentFields += 1;
  if (hasText(result.author)) presentFields += 1;
  if (hasText(result.description)) presentFields += 1;
  if (hasText(result.coverPath)) presentFields += 1;
  if (hasText(result.series)) presentFields += 1;
  return presentFields / 5;
};

export const buildCandidate = (
  provider: MetadataProvider,
  metadata: MetadataResult,
  queryTitle: string,
  queryAuthor?: string
): ProviderCandidate => {
  const titleScore = similarityScore(queryTitle, metadata.title);
  const authorScore = similarityScore(queryAuthor, metadata.author);
  const completeness = metadataCompleteness(metadata);
  const trust = providerTrustScore[provider] ?? 0.9;
  const overallScore =
    titleScore * 0.5 + authorScore * 0.2 + completeness * 0.2 + trust * 0.1;

  return {
    provider,
    metadata,
    titleScore,
    authorScore,
    completeness,
    trust,
    overallScore
  };
};

export const selectBestField = (
  candidates: ProviderCandidate[],
  extractor: (metadata: MetadataResult) => string | undefined,
  scorer: (candidate: ProviderCandidate, value: string) => number
): string | undefined => {
  let bestValue: string | undefined;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const value = extractor(candidate.metadata);
    if (!hasText(value)) continue;

    const score = scorer(candidate, value);
    if (score > bestScore) {
      bestScore = score;
      bestValue = value;
    }
  }

  return bestValue;
};

export const isStrongBookMatchCandidate = (
  candidate: ProviderCandidate,
  queryAuthor?: string
): boolean => {
  if (candidate.metadata.source === "NONE") return false;
  if (candidate.titleScore < 0.55) return false;

  const hasProviderAuthor = hasText(candidate.metadata.author);
  const hasQueryAuthor = hasText(queryAuthor);

  if (hasQueryAuthor && hasProviderAuthor) {
    if (candidate.authorScore < 0.3 && candidate.titleScore < 0.96) return false;
    if (candidate.titleScore < 0.72 && candidate.authorScore < 0.7) return false;
  }

  return true;
};

const clampScore = (value: number): number => Math.max(0, Math.min(1, value));

const getCoverQualityScore = (coverPath: string, provider: MetadataProvider): number => {
  let score = coverProviderPreferenceScore[provider] ?? 0.7;

  if (provider === "open_library") {
    score -= 0.12;
  }

  if (/-L\.(?:jpg|jpeg|png|webp)(?:$|\?)/i.test(coverPath)) {
    score += 0.06;
  }

  if (/-S\.(?:jpg|jpeg|png|webp)(?:$|\?)/i.test(coverPath)) {
    score -= 0.14;
  }

  if (/smallthumbnail|small[_-]?thumb|\/small\//i.test(coverPath)) {
    score -= 0.18;
  }

  if (/zoom=0\b/i.test(coverPath)) {
    score -= 0.08;
  } else if (/zoom=1\b/i.test(coverPath)) {
    score -= 0.04;
  } else if (/zoom=[2-9]\b/i.test(coverPath)) {
    score += 0.03;
  }

  if (/placeholder|default[_-]?cover|blank\.(?:jpg|jpeg|png|webp)/i.test(coverPath)) {
    score -= 0.25;
  }

  return clampScore(score);
};

export const scoreCoverCandidate = (
  candidate: ProviderCandidate,
  queryAuthor?: string
): number => {
  const coverPath = candidate.metadata.coverPath;
  if (
    !hasText(coverPath) ||
    candidate.metadata.source === "NONE" ||
    !isStrongBookMatchCandidate(candidate, queryAuthor)
  ) {
    return -Infinity;
  }

  const authorScore =
    hasText(queryAuthor) && hasText(candidate.metadata.author) ? candidate.authorScore : 0.65;
  const providerPreferenceScore = coverProviderPreferenceScore[candidate.provider] ?? 0.7;
  const qualityScore = getCoverQualityScore(coverPath, candidate.provider);

  return (
    candidate.titleScore * 0.44 +
    authorScore * 0.2 +
    qualityScore * 0.2 +
    providerPreferenceScore * 0.1 +
    candidate.trust * 0.06
  );
};

export const selectBestCoverPath = (
  candidates: ProviderCandidate[],
  queryAuthor?: string
): string | undefined => {
  let bestValue: string | undefined;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const coverPath = candidate.metadata.coverPath;
    if (!hasText(coverPath)) continue;

    const score = scoreCoverCandidate(candidate, queryAuthor);
    if (score > bestScore) {
      bestScore = score;
      bestValue = coverPath;
    }
  }

  return Number.isFinite(bestScore) ? bestValue : undefined;
};

export const buildCoverOptions = (
  candidates: ProviderCandidate[],
  selectedCoverPath: string | undefined,
  queryAuthor?: string
): MetadataCoverOption[] => {
  const selectedKey = hasText(selectedCoverPath) ? normalizeUrl(selectedCoverPath.trim()) : null;
  const rankedOptions = new Map<
    string,
    { option: MetadataCoverOption; score: number; providerIndex: number }
  >();

  for (const [providerIndex, candidate] of candidates.entries()) {
    const coverPath = candidate.metadata.coverPath?.trim();
    if (!hasText(coverPath) || candidate.metadata.source === "NONE") continue;

    const score = scoreCoverCandidate(candidate, queryAuthor);
    if (!Number.isFinite(score)) continue;

    const normalizedCover = normalizeUrl(coverPath);
    const current = rankedOptions.get(normalizedCover);
    if (
      current &&
      (current.score > score ||
        (current.score === score && current.providerIndex <= providerIndex))
    ) {
      continue;
    }

    rankedOptions.set(normalizedCover, {
      option: {
        coverPath,
        source: candidate.metadata.source
      },
      score,
      providerIndex
    });
  }

  const sortedOptions = [...rankedOptions.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.providerIndex - b.providerIndex;
    })
    .map((entry) => entry.option);

  let selectedOption: MetadataCoverOption | null = null;
  for (const option of sortedOptions) {
    const normalizedCover = normalizeUrl(option.coverPath);
    if (selectedKey && normalizedCover === selectedKey) {
      selectedOption = option;
      continue;
    }
  }

  const options = sortedOptions.filter((option) => {
    if (!selectedKey) return true;
    return normalizeUrl(option.coverPath) !== selectedKey;
  });

  return selectedOption ? [selectedOption, ...options] : options;
};

export const resolveDescriptionFromProviders = (
  candidates: ProviderCandidate[],
  llmDescription: string | undefined,
  queryAuthor?: string
): string | undefined => {
  if (!hasText(llmDescription)) return undefined;

  const llmNormalized = normalizeForMatch(llmDescription);
  if (!llmNormalized) return undefined;

  let bestValue: string | undefined;
  let bestScore = 0;

  for (const candidate of candidates) {
    const description = candidate.metadata.description;
    if (!hasText(description)) continue;
    if (!isStrongBookMatchCandidate(candidate, queryAuthor)) continue;

    const snippet = truncateForPrompt(cleanText(description), 200);
    const snippetNormalized = normalizeForMatch(snippet);
    const fullNormalized = normalizeForMatch(description);
    if (!snippetNormalized && !fullNormalized) continue;

    let score = 0;
    if (snippetNormalized === llmNormalized || fullNormalized === llmNormalized) {
      score = 1;
    } else if (
      snippetNormalized.includes(llmNormalized) ||
      llmNormalized.includes(snippetNormalized)
    ) {
      score = 0.96;
    } else if (fullNormalized.includes(llmNormalized) || llmNormalized.includes(fullNormalized)) {
      score = 0.92;
    } else {
      score = Math.max(
        similarityScore(llmDescription, snippet),
        similarityScore(llmDescription, description)
      );
    }

    if (score > bestScore) {
      bestScore = score;
      bestValue = description;
    }
  }

  return bestScore >= 0.45 ? bestValue : undefined;
};

export const resolveCoverFromProviders = (
  candidates: ProviderCandidate[],
  llmCoverPath: string | undefined
): string | undefined => {
  if (!hasText(llmCoverPath)) return undefined;
  const llmCover = llmCoverPath.trim();

  let bestValue: string | undefined;
  let bestScore = 0;

  for (const candidate of candidates) {
    const coverPath = candidate.metadata.coverPath;
    if (!hasText(coverPath)) continue;

    if (coverPath.trim() === llmCover) {
      return coverPath;
    }

    const normalizedCover = normalizeUrl(coverPath.trim());
    if (normalizedCover === normalizeUrl(llmCover)) {
      return coverPath;
    }

    const score = similarityScore(llmCover, coverPath);
    if (score > bestScore) {
      bestScore = score;
      bestValue = coverPath;
    }
  }

  return bestScore >= 0.75 ? bestValue : undefined;
};
