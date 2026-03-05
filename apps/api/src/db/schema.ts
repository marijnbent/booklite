import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["OWNER", "MEMBER"] }).notNull().default("MEMBER"),
  createdAt: text("created_at").notNull(),
  disabledAt: text("disabled_at")
});

export const refreshTokens = sqliteTable("refresh_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull()
});

export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerUserId: integer("owner_user_id").notNull(),
  title: text("title").notNull(),
  author: text("author"),
  series: text("series"),
  description: text("description"),
  coverPath: text("cover_path"),
  filePath: text("file_path").notNull().unique(),
  fileExt: text("file_ext").notNull(),
  fileSize: integer("file_size").notNull(),
  koboSyncable: integer("kobo_syncable").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const bookProgress = sqliteTable(
  "book_progress",
  {
    userId: integer("user_id").notNull(),
    bookId: integer("book_id").notNull(),
    status: text("status", { enum: ["UNREAD", "READING", "DONE"] }).notNull().default("UNREAD"),
    progressPercent: real("progress_percent").notNull().default(0),
    positionRef: text("position_ref"),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.bookId] })
  })
);

export const collections = sqliteTable("collections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  icon: text("icon"),
  slug: text("slug"),
  isSystem: integer("is_system").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const collectionBooks = sqliteTable(
  "collection_books",
  {
    collectionId: integer("collection_id").notNull(),
    bookId: integer("book_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0)
  },
  (table) => ({
    pk: primaryKey({ columns: [table.collectionId, table.bookId] })
  })
);

export const koboUserSettings = sqliteTable("kobo_user_settings", {
  userId: integer("user_id").primaryKey(),
  token: text("token").notNull().unique(),
  syncEnabled: integer("sync_enabled").notNull().default(0),
  twoWayProgressSync: integer("two_way_progress_sync").notNull().default(0),
  markReadingThreshold: real("mark_reading_threshold").notNull().default(1),
  markFinishedThreshold: real("mark_finished_threshold").notNull().default(99),
  updatedAt: text("updated_at").notNull()
});

export const koboSyncCollections = sqliteTable(
  "kobo_sync_collections",
  {
    userId: integer("user_id").notNull(),
    collectionId: integer("collection_id").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.collectionId] })
  })
);

export const koboReadingState = sqliteTable(
  "kobo_reading_state",
  {
    userId: integer("user_id").notNull(),
    bookId: integer("book_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    lastModifiedAt: text("last_modified_at").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.bookId] })
  })
);

export const koboSyncSnapshots = sqliteTable("kobo_sync_snapshots", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  createdAt: text("created_at").notNull()
});

export const importJobs = sqliteTable("import_jobs", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  status: text("status", { enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"] }).notNull(),
  type: text("type").notNull(),
  payloadJson: text("payload_json").notNull(),
  resultJson: text("result_json"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull()
});

export const schema = {
  users,
  refreshTokens,
  books,
  bookProgress,
  collections,
  collectionBooks,
  koboUserSettings,
  koboSyncCollections,
  koboReadingState,
  koboSyncSnapshots,
  importJobs,
  appSettings
};
