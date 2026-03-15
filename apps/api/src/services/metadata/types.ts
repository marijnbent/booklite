import type {
  MetadataCoverOption,
  MetadataPreviewResult,
  MetadataResult
} from "@booklite/shared";
import type {
  MetadataProviderEnabled,
  MetadataProviderKey
} from "../../utils/metadataProviders";

export type { MetadataCoverOption, MetadataPreviewResult, MetadataResult } from "@booklite/shared";

export type MetadataProvider = MetadataProviderKey;

export interface ProviderCandidate {
  provider: MetadataProvider;
  metadata: MetadataResult;
  titleScore: number;
  authorScore: number;
  completeness: number;
  trust: number;
  overallScore: number;
}

export interface MetadataSettings {
  providerEnabled: MetadataProviderEnabled;
  amazonDomain: string;
  amazonCookie: string;
  googleLanguage: string;
  googleApiKey: string;
  hardcoverApiKey: string;
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterEnabled: boolean;
}

export type ProviderFetcher = (
  title: string,
  author: string | undefined,
  settings: MetadataSettings
) => Promise<MetadataResult | null>;
