import { config } from "../../config";
import { getSetting } from "../../db/client";
import {
  defaultMetadataProviderEnabled,
  toMetadataProviderEnabled
} from "../../utils/metadataProviders";
import type { MetadataSettings } from "./types";
import { resolveOpenRouterSettings } from "../aiSettings";

export const resolveMetadataProviderSettings = async (): Promise<MetadataSettings> => {
  const openrouter = await resolveOpenRouterSettings();

  return {
    providerEnabled: toMetadataProviderEnabled(
      await getSetting<unknown>("metadata_provider_enabled", defaultMetadataProviderEnabled),
      defaultMetadataProviderEnabled
    ),
    amazonDomain: (
      await getSetting<string>("metadata_amazon_domain", config.amazonBooksDomain)
    ).trim(),
    amazonCookie: (
      await getSetting<string>("metadata_amazon_cookie", config.amazonBooksCookie)
    ).trim(),
    googleLanguage: (
      await getSetting<string>("metadata_google_language", config.googleBooksLanguage)
    ).trim(),
    googleApiKey: (
      await getSetting<string>("metadata_google_api_key", config.googleBooksApiKey)
    ).trim(),
    hardcoverApiKey: (
      await getSetting<string>("metadata_hardcover_api_key", config.hardcoverApiKey)
    ).trim(),
    ...openrouter
  };
};
