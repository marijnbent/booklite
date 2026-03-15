import type { MetadataProviderEnabled } from "../../../utils/metadataProviders";
import { providerPreference } from "../constants";
import type { MetadataProvider, ProviderFetcher } from "../types";
import { getAmazonMetadata } from "./amazon";
import { getBolMetadata } from "./bol";
import { getDoubanMetadata } from "./douban";
import { getGoodreadsMetadata } from "./goodreads";
import { getGoogleMetadata } from "./google";
import { getHardcoverMetadata } from "./hardcover";
import { getOpenLibraryMetadata } from "./openLibrary";

export const providerFetchers: Record<MetadataProvider, ProviderFetcher> = {
  open_library: (title, author) => getOpenLibraryMetadata(title, author),
  amazon: (title, author, settings) =>
    getAmazonMetadata(title, author, settings.amazonDomain || "com", settings.amazonCookie),
  bol: (title, author) => getBolMetadata(title, author),
  google: (title, author, settings) =>
    getGoogleMetadata(title, author, settings.googleApiKey, settings.googleLanguage),
  hardcover: (title, author, settings) =>
    getHardcoverMetadata(title, author, settings.hardcoverApiKey),
  goodreads: (title, author) => getGoodreadsMetadata(title, author),
  douban: (title, author) => getDoubanMetadata(title, author)
};

export const buildProviderFetchOrder = (
  providerEnabled: MetadataProviderEnabled
): MetadataProvider[] => providerPreference.filter((provider) => providerEnabled[provider]);
