import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db, getSetting } from "../db/client";
import { appSettings } from "../db/schema";
import { requireOwner } from "../auth/guards";
import { config } from "../config";

const metadataProviderSchema = z.enum([
  "open_library",
  "amazon",
  "google",
  "hardcover",
  "goodreads",
  "douban",
  "none"
]);
type MetadataProvider = z.infer<typeof metadataProviderSchema>;

const amazonDomainSchema = z.enum([
  "com",
  "co.uk",
  "de",
  "fr",
  "es",
  "it",
  "nl",
  "ca",
  "com.au"
]);
type AmazonDomain = z.infer<typeof amazonDomainSchema>;

const toProvider = (
  value: unknown,
  fallback: MetadataProvider
): MetadataProvider => {
  const parsed = metadataProviderSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};

const patchSettingsSchema = z.object({
  metadataProviderPrimary: metadataProviderSchema.optional(),
  metadataProviderSecondary: metadataProviderSchema.optional(),
  metadataProviderTertiary: metadataProviderSchema.optional(),
  metadataAmazonDomain: amazonDomainSchema.optional(),
  metadataAmazonCookie: z.string().trim().optional(),
  metadataGoogleLanguage: z.string().trim().max(8).optional(),
  metadataGoogleApiKey: z.string().trim().optional(),
  metadataHardcoverApiKey: z.string().trim().optional(),
  metadataProviderFallback: z.enum(["google", "none"]).optional(),
  uploadLimitMb: z.coerce.number().int().min(1).max(1000).optional()
});

const toLegacyFallback = (
  secondary: MetadataProvider,
  tertiary: MetadataProvider
): "google" | "none" =>
  secondary === "google" || tertiary === "google" ? "google" : "none";

const toAmazonDomain = (value: unknown, fallback: AmazonDomain): AmazonDomain => {
  const parsed = amazonDomainSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};

const resolveSettings = async (): Promise<{
  metadataProviderPrimary: MetadataProvider;
  metadataProviderSecondary: MetadataProvider;
  metadataProviderTertiary: MetadataProvider;
  metadataAmazonDomain: AmazonDomain;
  metadataAmazonCookie: string;
  metadataGoogleLanguage: string;
  metadataGoogleApiKey: string;
  metadataHardcoverApiKey: string;
  metadataProviderFallback: "google" | "none";
  uploadLimitMb: number;
}> => {
  const legacyFallback = await getSetting<"google" | "none">(
    "metadata_provider_fallback",
    "google"
  );
  const defaultSecondary: MetadataProvider =
    legacyFallback === "google" ? "google" : "none";

  const metadataProviderPrimary = toProvider(
    await getSetting<MetadataProvider>("metadata_provider_primary", "open_library"),
    "open_library"
  );
  const metadataProviderSecondary = toProvider(
    await getSetting<MetadataProvider>("metadata_provider_secondary", defaultSecondary),
    defaultSecondary
  );
  const metadataProviderTertiary = toProvider(
    await getSetting<MetadataProvider>("metadata_provider_tertiary", "none"),
    "none"
  );

  return {
    metadataProviderPrimary,
    metadataProviderSecondary,
    metadataProviderTertiary,
    metadataAmazonDomain: toAmazonDomain(
      await getSetting<string>("metadata_amazon_domain", config.amazonBooksDomain),
      "com"
    ),
    metadataAmazonCookie: await getSetting<string>(
      "metadata_amazon_cookie",
      config.amazonBooksCookie
    ),
    metadataGoogleLanguage: await getSetting<string>(
      "metadata_google_language",
      config.googleBooksLanguage
    ),
    metadataGoogleApiKey: await getSetting<string>(
      "metadata_google_api_key",
      config.googleBooksApiKey
    ),
    metadataHardcoverApiKey: await getSetting<string>(
      "metadata_hardcover_api_key",
      config.hardcoverApiKey
    ),
    metadataProviderFallback: toLegacyFallback(
      metadataProviderSecondary,
      metadataProviderTertiary
    ),
    uploadLimitMb: await getSetting<number>("upload_limit_mb", 100)
  };
};

export const appSettingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/app-settings", { preHandler: requireOwner }, async () =>
    resolveSettings()
  );

  fastify.patch(
    "/api/v1/app-settings",
    { preHandler: requireOwner },
    async (request) => {
      const body = patchSettingsSchema.parse(request.body);

      const upsert = async (key: string, value: unknown): Promise<void> => {
        await db
          .insert(appSettings)
          .values({ key, valueJson: JSON.stringify(value) })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: { valueJson: JSON.stringify(value) }
          });
      };

      if (body.metadataProviderFallback !== undefined) {
        await upsert("metadata_provider_fallback", body.metadataProviderFallback);
        await upsert(
          "metadata_provider_secondary",
          body.metadataProviderFallback === "google" ? "google" : "none"
        );
        await upsert("metadata_provider_tertiary", "none");
      }
      if (body.metadataProviderPrimary !== undefined) {
        await upsert("metadata_provider_primary", body.metadataProviderPrimary);
      }
      if (body.metadataProviderSecondary !== undefined) {
        await upsert("metadata_provider_secondary", body.metadataProviderSecondary);
      }
      if (body.metadataProviderTertiary !== undefined) {
        await upsert("metadata_provider_tertiary", body.metadataProviderTertiary);
      }
      if (body.metadataAmazonDomain !== undefined) {
        await upsert("metadata_amazon_domain", body.metadataAmazonDomain);
      }
      if (body.metadataAmazonCookie !== undefined) {
        await upsert("metadata_amazon_cookie", body.metadataAmazonCookie);
      }
      if (body.metadataGoogleLanguage !== undefined) {
        await upsert("metadata_google_language", body.metadataGoogleLanguage);
      }
      if (body.metadataGoogleApiKey !== undefined) {
        await upsert("metadata_google_api_key", body.metadataGoogleApiKey);
      }
      if (body.metadataHardcoverApiKey !== undefined) {
        await upsert("metadata_hardcover_api_key", body.metadataHardcoverApiKey);
      }
      if (body.uploadLimitMb !== undefined) {
        await upsert("upload_limit_mb", body.uploadLimitMb);
      }

      return resolveSettings();
    }
  );
};
