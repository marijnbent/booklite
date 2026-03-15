import { z } from "zod";

export const metadataProviderKeys = [
  "open_library",
  "amazon",
  "bol",
  "google",
  "hardcover",
  "goodreads",
  "douban"
] as const;

export type MetadataProviderKey = (typeof metadataProviderKeys)[number];

export const metadataProviderEnabledSchema = z
  .object({
    open_library: z.boolean(),
    amazon: z.boolean(),
    bol: z.boolean(),
    google: z.boolean(),
    hardcover: z.boolean(),
    goodreads: z.boolean(),
    douban: z.boolean()
  })
  .strict();

export type MetadataProviderEnabled = z.infer<typeof metadataProviderEnabledSchema>;

export const defaultMetadataProviderEnabled: MetadataProviderEnabled = {
  open_library: true,
  amazon: true,
  bol: false,
  google: true,
  hardcover: false,
  goodreads: true,
  douban: false
};

export const toMetadataProviderEnabled = (
  value: unknown,
  fallback: MetadataProviderEnabled = defaultMetadataProviderEnabled
): MetadataProviderEnabled => {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const row = value as Record<MetadataProviderKey, unknown>;

  return {
    open_library:
      typeof row.open_library === "boolean" ? row.open_library : fallback.open_library,
    amazon: typeof row.amazon === "boolean" ? row.amazon : fallback.amazon,
    bol: typeof row.bol === "boolean" ? row.bol : fallback.bol,
    google: typeof row.google === "boolean" ? row.google : fallback.google,
    hardcover: typeof row.hardcover === "boolean" ? row.hardcover : fallback.hardcover,
    goodreads: typeof row.goodreads === "boolean" ? row.goodreads : fallback.goodreads,
    douban: typeof row.douban === "boolean" ? row.douban : fallback.douban
  };
};
