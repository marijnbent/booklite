import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db, getSetting } from "../db/client";
import { appSettings } from "../db/schema";
import { requireOwner } from "../auth/guards";
import { config } from "../config";

const providerValues = [
  "open_library",
  "amazon",
  "google",
  "hardcover",
  "goodreads",
  "douban"
] as const;

type EnabledMetadataProvider = (typeof providerValues)[number];

const metadataProviderEnabledSchema = z
  .object({
    open_library: z.boolean(),
    amazon: z.boolean(),
    google: z.boolean(),
    hardcover: z.boolean(),
    goodreads: z.boolean(),
    douban: z.boolean()
  })
  .strict();
type MetadataProviderEnabled = z.infer<typeof metadataProviderEnabledSchema>;

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

const defaultMetadataProviderEnabled: MetadataProviderEnabled = {
  open_library: true,
  amazon: true,
  google: true,
  hardcover: false,
  goodreads: true,
  douban: false
};

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
    uploadLimitMb: z.coerce.number().int().min(1).max(1000).optional()
  })
  .strict();

const toMetadataProviderEnabled = (
  value: unknown,
  fallback: MetadataProviderEnabled
): MetadataProviderEnabled => {
  if (!value || typeof value !== "object") return fallback;
  const row = value as Record<EnabledMetadataProvider, unknown>;

  return {
    open_library:
      typeof row.open_library === "boolean" ? row.open_library : fallback.open_library,
    amazon: typeof row.amazon === "boolean" ? row.amazon : fallback.amazon,
    google: typeof row.google === "boolean" ? row.google : fallback.google,
    hardcover: typeof row.hardcover === "boolean" ? row.hardcover : fallback.hardcover,
    goodreads: typeof row.goodreads === "boolean" ? row.goodreads : fallback.goodreads,
    douban: typeof row.douban === "boolean" ? row.douban : fallback.douban
  };
};

const toAmazonDomain = (value: unknown, fallback: AmazonDomain): AmazonDomain => {
  const parsed = amazonDomainSchema.safeParse(value);
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
  uploadLimitMb: number;
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
  uploadLimitMb: await getSetting<number>("upload_limit_mb", 100)
});

export const appSettingsRoutes: FastifyPluginAsync = async (fastify) => {
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
      if (body.uploadLimitMb !== undefined) {
        await upsert("upload_limit_mb", body.uploadLimitMb);
      }

      return resolveSettings();
    }
  );
};
