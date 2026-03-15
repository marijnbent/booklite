import type { MetadataProvider } from "./types";

export const providerPreference: MetadataProvider[] = [
  "open_library",
  "google",
  "goodreads",
  "hardcover",
  "amazon",
  "bol",
  "douban"
];

export const coverProviderPreference: MetadataProvider[] = [
  "goodreads",
  "hardcover",
  "google",
  "amazon",
  "bol",
  "open_library",
  "douban"
];

export const providerTrustScore: Record<MetadataProvider, number> = {
  open_library: 1,
  google: 0.98,
  goodreads: 0.95,
  hardcover: 0.95,
  amazon: 0.92,
  bol: 0.91,
  douban: 0.9
};
