import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import { appSettings, schema } from "./schema";
import { config, dbFilePath } from "../config";
import { DEFAULT_OPENROUTER_MODEL } from "../services/aiConstants";

const ensureDir = (target: string): void => {
  fs.mkdirSync(target, { recursive: true });
};

ensureDir(path.dirname(dbFilePath));
ensureDir(config.booksDir);
ensureDir(path.join(config.appDataDir, "tmp"));

export const sqlite = new Database(dbFilePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("synchronous = NORMAL");

export const db = drizzle(sqlite, { schema });

export const seedDefaultAppSettings = (): void => {
  const insertSetting = sqlite.prepare(
    "INSERT OR IGNORE INTO app_settings(key, value_json) VALUES (?, ?)"
  );

  insertSetting.run("metadata_amazon_domain", JSON.stringify(config.amazonBooksDomain));
  insertSetting.run("metadata_amazon_cookie", JSON.stringify(config.amazonBooksCookie));
  insertSetting.run("metadata_google_language", JSON.stringify(config.googleBooksLanguage));
  insertSetting.run("metadata_google_api_key", JSON.stringify(config.googleBooksApiKey));
  insertSetting.run("metadata_hardcover_api_key", JSON.stringify(config.hardcoverApiKey));
  insertSetting.run("metadata_openrouter_model", JSON.stringify(DEFAULT_OPENROUTER_MODEL));
  insertSetting.run("upload_limit_mb", JSON.stringify(config.uploadLimitMb));

  // OpenRouter credentials are environment-only. Remove values saved by older releases.
  sqlite.prepare("DELETE FROM app_settings WHERE key = ?").run("metadata_openrouter_api_key");
};

export const walCheckpoint = (): void => {
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
};

export const closeDatabase = (): void => {
  if (!sqlite.open) return;
  walCheckpoint();
  sqlite.close();
};

export const getSetting = async <T>(key: string, fallback: T): Promise<T> => {
  const result = await db
    .select({ valueJson: appSettings.valueJson })
    .from(appSettings)
    .where(sql`${appSettings.key} = ${key}`)
    .limit(1);

  if (result.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(result[0].valueJson) as T;
  } catch {
    return fallback;
  }
};
