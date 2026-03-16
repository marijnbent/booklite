import type { MetadataProviderEnabled } from "../../../utils/metadataProviders";
import type { MetadataProvider, ProviderFetcher } from "../types";
import { getAmazonMetadata } from "./amazon";
import { getBolMetadata } from "./bol";
import { getDoubanMetadata } from "./douban";
import { getGoodreadsMetadata } from "./goodreads";
import { getGoogleMetadata } from "./google";
import { getHardcoverMetadata } from "./hardcover";
import { getOpenLibraryMetadata } from "./openLibrary";

const coverPreferenceStep = 0.08;

type ProviderRegistryEntry = {
  fetcher: ProviderFetcher;
  trust: number;
  fetchOrder: number;
  coverOrder: number;
};

export const providerRegistry: Record<MetadataProvider, ProviderRegistryEntry> = {
  open_library: {
    fetcher: (title, author) => getOpenLibraryMetadata(title, author),
    trust: 1,
    fetchOrder: 0,
    coverOrder: 5
  },
  google: {
    fetcher: (title, author, settings) =>
      getGoogleMetadata(title, author, settings.googleApiKey, settings.googleLanguage),
    trust: 0.98,
    fetchOrder: 1,
    coverOrder: 2
  },
  goodreads: {
    fetcher: (title, author) => getGoodreadsMetadata(title, author),
    trust: 0.95,
    fetchOrder: 2,
    coverOrder: 0
  },
  hardcover: {
    fetcher: (title, author, settings) =>
      getHardcoverMetadata(title, author, settings.hardcoverApiKey),
    trust: 0.95,
    fetchOrder: 3,
    coverOrder: 1
  },
  amazon: {
    fetcher: (title, author, settings) =>
      getAmazonMetadata(title, author, settings.amazonDomain || "com", settings.amazonCookie),
    trust: 0.92,
    fetchOrder: 4,
    coverOrder: 3
  },
  bol: {
    fetcher: (title, author) => getBolMetadata(title, author),
    trust: 0.91,
    fetchOrder: 5,
    coverOrder: 4
  },
  douban: {
    fetcher: (title, author) => getDoubanMetadata(title, author),
    trust: 0.9,
    fetchOrder: 6,
    coverOrder: 6
  }
};

export const providerFetchers: Record<MetadataProvider, ProviderFetcher> = Object.fromEntries(
  Object.entries(providerRegistry).map(([provider, entry]) => [provider, entry.fetcher])
) as Record<MetadataProvider, ProviderFetcher>;

export const providerTrustScore: Record<MetadataProvider, number> = Object.fromEntries(
  Object.entries(providerRegistry).map(([provider, entry]) => [provider, entry.trust])
) as Record<MetadataProvider, number>;

const providerPreference = (Object.entries(providerRegistry) as Array<
  [MetadataProvider, ProviderRegistryEntry]
>)
  .sort((a, b) => a[1].fetchOrder - b[1].fetchOrder)
  .map(([provider]) => provider);

export const buildProviderFetchOrder = (
  providerEnabled: MetadataProviderEnabled
): MetadataProvider[] => providerPreference.filter((provider) => providerEnabled[provider]);

export const coverProviderPreferenceScore: Record<MetadataProvider, number> = Object.fromEntries(
  (Object.entries(providerRegistry) as Array<[MetadataProvider, ProviderRegistryEntry]>)
    .sort((a, b) => a[1].coverOrder - b[1].coverOrder)
    .map(([provider], index) => [provider, 1 - index * coverPreferenceStep])
) as Record<MetadataProvider, number>;
