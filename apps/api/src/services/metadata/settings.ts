import { config } from "../../config";
import { getSetting } from "../../db/client";
import {
  defaultMetadataProviderEnabled,
  toMetadataProviderEnabled
} from "../../utils/metadataProviders";
import type { MetadataSettings } from "./types";

export const resolveMetadataProviderSettings = async (): Promise<MetadataSettings> => {
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
    openrouterApiKey: (
      (await getSetting<string>("metadata_openrouter_api_key", config.openrouterApiKey ?? "")) ??
      ""
    ).trim(),
    openrouterModel: ((await getSetting<string>("metadata_openrouter_model", "")) ?? "").trim(),
    openrouterEnabled: await getSetting<boolean>("metadata_openrouter_enabled", false)
  };
};
