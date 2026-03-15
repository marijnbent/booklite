import {
  fetchMetadataPreview as fetchMetadataPreviewImpl,
  fetchMetadataWithFallback as fetchMetadataWithFallbackImpl
} from "./metadata/service";

export const fetchMetadataPreview = fetchMetadataPreviewImpl;
export const fetchMetadataWithFallback = fetchMetadataWithFallbackImpl;

export type {
  MetadataCoverOption,
  MetadataPreviewResult,
  MetadataResult,
  MetadataProvider,
  ProviderCandidate
} from "./metadata/types";
