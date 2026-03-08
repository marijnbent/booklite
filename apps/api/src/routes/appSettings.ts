import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db, getSetting } from "../db/client";
import { appSettings } from "../db/schema";
import { requireAuth, requireOwner } from "../auth/guards";
import { config } from "../config";
import {
  defaultMetadataProviderEnabled,
  metadataProviderEnabledSchema,
  type MetadataProviderEnabled,
  toMetadataProviderEnabled
} from "../utils/metadataProviders";

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

const optionalUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || z.string().url().safeParse(value).success,
    "Must be a valid URL or empty"
  );

const patchSettingsSchema = z
  .object({
    metadataProviderEnabled: metadataProviderEnabledSchema.optional(),
    metadataAmazonDomain: amazonDomainSchema.optional(),
    metadataAmazonCookie: z.string().trim().optional(),
    metadataGoogleLanguage: z.string().trim().max(8).optional(),
    metadataGoogleApiKey: z.string().trim().optional(),
    metadataHardcoverApiKey: z.string().trim().optional(),
    metadataOpenrouterApiKey: z.string().trim().optional(),
    metadataOpenrouterModel: z.string().trim().max(100).optional(),
    metadataOpenrouterEnabled: z.boolean().optional(),
    koboDebugLogging: z.boolean().optional(),
    uploadLimitMb: z.coerce.number().int().min(1).max(1000).optional(),
    ebookDownloadUrl: optionalUrlSchema.optional()
  })
  .strict();

const toAmazonDomain = (value: unknown, fallback: AmazonDomain): AmazonDomain => {
  const parsed = amazonDomainSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};

const toOptionalUrl = (value: unknown, fallback = ""): string => {
  const parsed = optionalUrlSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};

const resolveSettings = async (): Promise<{
  metadataProviderEnabled: MetadataProviderEnabled;
  metadataAmazonDomain: AmazonDomain;
  metadataAmazonCookie: string;
  metadataGoogleLanguage: string;
  metadataGoogleApiKey: string;
  metadataHardcoverApiKey: string;
  metadataOpenrouterApiKey: string;
  metadataOpenrouterModel: string;
  metadataOpenrouterEnabled: boolean;
  koboDebugLogging: boolean;
  uploadLimitMb: number;
  ebookDownloadUrl: string;
}> => ({
  metadataProviderEnabled: toMetadataProviderEnabled(
    await getSetting<unknown>("metadata_provider_enabled", defaultMetadataProviderEnabled),
    defaultMetadataProviderEnabled
  ),
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
  metadataOpenrouterApiKey: await getSetting<string>(
    "metadata_openrouter_api_key",
    config.openrouterApiKey ?? ""
  ),
  metadataOpenrouterModel: await getSetting<string>(
    "metadata_openrouter_model",
    ""
  ),
  metadataOpenrouterEnabled: await getSetting<boolean>("metadata_openrouter_enabled", false),
  koboDebugLogging: await getSetting<boolean>("kobo_debug_logging", false),
  uploadLimitMb: await getSetting<number>("upload_limit_mb", 100),
  ebookDownloadUrl: toOptionalUrl(await getSetting<unknown>("ebook_download_url", ""))
});

const resolvePublicSettings = async (): Promise<{ ebookDownloadUrl: string }> => ({
  ebookDownloadUrl: toOptionalUrl(await getSetting<unknown>("ebook_download_url", ""))
});

export const appSettingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/api/v1/app-settings/public",
    { preHandler: requireAuth },
    async () => resolvePublicSettings()
  );

  fastify.get("/api/v1/app-settings", { preHandler: requireOwner }, async () =>
    resolveSettings()
  );

  fastify.patch(
    "/api/v1/app-settings",
    { preHandler: requireOwner },
    async (request, reply) => {
      const parsedBody = patchSettingsSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid app settings payload",
          issues: parsedBody.error.issues
        });
      }
      const body = parsedBody.data;

      const upsert = async (key: string, value: unknown): Promise<void> => {
        await db
          .insert(appSettings)
          .values({ key, valueJson: JSON.stringify(value) })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: { valueJson: JSON.stringify(value) }
          });
      };

      if (body.metadataProviderEnabled !== undefined) {
        await upsert("metadata_provider_enabled", body.metadataProviderEnabled);
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
      if (body.metadataOpenrouterApiKey !== undefined) {
        await upsert("metadata_openrouter_api_key", body.metadataOpenrouterApiKey);
      }
      if (body.metadataOpenrouterModel !== undefined) {
        await upsert("metadata_openrouter_model", body.metadataOpenrouterModel);
      }
      if (body.metadataOpenrouterEnabled !== undefined) {
        await upsert("metadata_openrouter_enabled", body.metadataOpenrouterEnabled);
      }
      if (body.koboDebugLogging !== undefined) {
        await upsert("kobo_debug_logging", body.koboDebugLogging);
      }
      if (body.uploadLimitMb !== undefined) {
        await upsert("upload_limit_mb", body.uploadLimitMb);
      }
      if (body.ebookDownloadUrl !== undefined) {
        await upsert("ebook_download_url", body.ebookDownloadUrl);
      }

      return resolveSettings();
    }
  );
};
