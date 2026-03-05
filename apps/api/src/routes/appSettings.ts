import { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, getSetting } from "../db/client";
import { appSettings } from "../db/schema";
import { requireOwner } from "../auth/guards";

const patchSettingsSchema = z.object({
  metadataProviderFallback: z.enum(["google", "none"]).optional(),
  kepubConversionEnabled: z.boolean().optional(),
  uploadLimitMb: z.coerce.number().int().min(1).max(1000).optional()
});

export const appSettingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/app-settings", { preHandler: requireOwner }, async () => ({
    metadataProviderFallback: await getSetting<"google" | "none">(
      "metadata_provider_fallback",
      "google"
    ),
    kepubConversionEnabled: await getSetting<boolean>(
      "kepub_conversion_enabled",
      false
    ),
    uploadLimitMb: await getSetting<number>("upload_limit_mb", 100)
  }));

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
      }
      if (body.kepubConversionEnabled !== undefined) {
        await upsert("kepub_conversion_enabled", body.kepubConversionEnabled);
      }
      if (body.uploadLimitMb !== undefined) {
        await upsert("upload_limit_mb", body.uploadLimitMb);
      }

      return {
        metadataProviderFallback: await getSetting<"google" | "none">(
          "metadata_provider_fallback",
          "google"
        ),
        kepubConversionEnabled: await getSetting<boolean>(
          "kepub_conversion_enabled",
          false
        ),
        uploadLimitMb: await getSetting<number>("upload_limit_mb", 100)
      };
    }
  );
};
