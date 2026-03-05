import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import { appSettings, schema } from "./schema";
import { config, dbFilePath } from "../config";

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

sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  created_at TEXT NOT NULL,
  disabled_at TEXT
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  series TEXT,
  description TEXT,
  cover_path TEXT,
  file_path TEXT NOT NULL UNIQUE,
  file_ext TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  kobo_syncable INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS book_progress (
  user_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNREAD',
  progress_percent REAL NOT NULL DEFAULT 0,
  position_ref TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, book_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  slug TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collection_books (
  collection_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, book_id),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kobo_user_settings (
  user_id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  sync_enabled INTEGER NOT NULL DEFAULT 0,
  two_way_progress_sync INTEGER NOT NULL DEFAULT 0,
  mark_reading_threshold REAL NOT NULL DEFAULT 1,
  mark_finished_threshold REAL NOT NULL DEFAULT 99,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kobo_sync_collections (
  user_id INTEGER NOT NULL,
  collection_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, collection_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kobo_reading_state (
  user_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  last_modified_at TEXT NOT NULL,
  PRIMARY KEY (user_id, book_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kobo_sync_snapshots (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS book_search USING fts5(
  title,
  author,
  series,
  description,
  content='books',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS books_ai AFTER INSERT ON books BEGIN
  INSERT INTO book_search(rowid, title, author, series, description)
  VALUES (new.id, new.title, COALESCE(new.author, ''), COALESCE(new.series, ''), COALESCE(new.description, ''));
END;

CREATE TRIGGER IF NOT EXISTS books_ad AFTER DELETE ON books BEGIN
  INSERT INTO book_search(book_search, rowid, title, author, series, description)
  VALUES('delete', old.id, old.title, COALESCE(old.author, ''), COALESCE(old.series, ''), COALESCE(old.description, ''));
END;

CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE ON books BEGIN
  INSERT INTO book_search(book_search, rowid, title, author, series, description)
  VALUES('delete', old.id, old.title, COALESCE(old.author, ''), COALESCE(old.series, ''), COALESCE(old.description, ''));
  INSERT INTO book_search(rowid, title, author, series, description)
  VALUES (new.id, new.title, COALESCE(new.author, ''), COALESCE(new.series, ''), COALESCE(new.description, ''));
END;
`);

const collectionCols = sqlite
  .prepare("PRAGMA table_info(collections)")
  .all() as Array<{ name: string }>;

if (!collectionCols.some((col) => col.name === "slug")) {
  sqlite.exec("ALTER TABLE collections ADD COLUMN slug TEXT");
}

if (!collectionCols.some((col) => col.name === "is_system")) {
  sqlite.exec("ALTER TABLE collections ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0");
}

sqlite.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_user_slug
ON collections(user_id, slug)
WHERE slug IS NOT NULL;
`);

export const db = drizzle(sqlite, { schema });

const insertSetting = sqlite.prepare(
  "INSERT OR IGNORE INTO app_settings(key, value_json) VALUES (?, ?)"
);
insertSetting.run("metadata_provider_fallback", JSON.stringify("google"));
insertSetting.run("kepub_conversion_enabled", JSON.stringify(false));
insertSetting.run("upload_limit_mb", JSON.stringify(config.uploadLimitMb));

export const walCheckpoint = (): void => {
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
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
