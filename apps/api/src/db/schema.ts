import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { READ_STATUSES } from "@booklite/shared";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["OWNER", "MEMBER"] }).notNull().default("MEMBER"),
  createdAt: text("created_at").notNull(),
  disabledAt: text("disabled_at")
});

export const refreshTokens = sqliteTable("refresh_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull()
});

export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerUserId: integer("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
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

export const bookShares = sqliteTable("book_shares", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  ownerUserId: integer("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  recipientUserId: integer("recipient_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sharedAt: text("shared_at").notNull(),
  removedAt: text("removed_at")
}, (table) => [
  uniqueIndex("idx_book_shares_book_recipient").on(table.bookId, table.recipientUserId),
  index("idx_book_shares_recipient").on(table.recipientUserId, table.removedAt, table.bookId)
]);

export const bookProgress = sqliteTable(
  "book_progress",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    status: text("status", { enum: READ_STATUSES }).notNull().default("UNSET"),
    progressPercent: real("progress_percent").notNull().default(0),
    positionRef: text("position_ref"),
    positionType: text("position_type"),
    positionSource: text("position_source"),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.bookId] })
  })
);

export const collections = sqliteTable("collections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon"),
  slug: text("slug"),
  isSystem: integer("is_system").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => [
  uniqueIndex("idx_collections_user_slug")
    .on(table.userId, table.slug)
    .where(sql`${table.slug} IS NOT NULL`)
]);

export const collectionBooks = sqliteTable(
  "collection_books",
  {
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0)
  },
  (table) => ({
    pk: primaryKey({ columns: [table.collectionId, table.bookId] })
  })
);

export const koboUserSettings = sqliteTable("kobo_user_settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  syncEnabled: integer("sync_enabled").notNull().default(1),
  syncAllBooks: integer("sync_all_books").notNull().default(0),
  twoWayProgressSync: integer("two_way_progress_sync").notNull().default(0),
  markReadingThreshold: real("mark_reading_threshold").notNull().default(1),
  markFinishedThreshold: real("mark_finished_threshold").notNull().default(99),
  updatedAt: text("updated_at").notNull()
});

export const koboSyncCollections = sqliteTable(
  "kobo_sync_collections",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.collectionId] })
  })
);

export const koboReadingState = sqliteTable(
  "kobo_reading_state",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    payloadJson: text("payload_json").notNull(),
    lastModifiedAt: text("last_modified_at").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.bookId] })
  })
);

export const koboSyncSnapshots = sqliteTable("kobo_sync_snapshots", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  snapshotJson: text("snapshot_json").notNull(),
  createdAt: text("created_at").notNull()
});

export const koboPendingRedeliveries = sqliteTable(
  "kobo_pending_redeliveries",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.bookId] })
  })
);

export const importJobs = sqliteTable("import_jobs", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
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

export const apiTokens = sqliteTable("api_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  jti: text("jti").notNull().unique(),
  label: text("label"),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull()
});

export const adminActivityLog = sqliteTable("admin_activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scope: text("scope", { enum: ["metadata", "upload", "kobo", "auth"] }).notNull(),
  event: text("event").notNull(),
  level: text("level", { enum: ["ERROR", "WARN", "INFO"] }).notNull().default("ERROR"),
  message: text("message").notNull(),
  detailsJson: text("details_json"),
  actorUserId: integer("actor_user_id"),
  targetUserId: integer("target_user_id"),
  bookId: integer("book_id"),
  jobId: text("job_id"),
  createdAt: text("created_at").notNull()
}, (table) => [
  index("idx_admin_activity_log_created_at").on(sql`${table.createdAt} DESC`, sql`${table.id} DESC`),
  index("idx_admin_activity_log_scope_created_at").on(
    table.scope,
    sql`${table.createdAt} DESC`,
    sql`${table.id} DESC`
  )
]);

export const schema = {
  users,
  refreshTokens,
  apiTokens,
  books,
  bookShares,
  bookProgress,
  collections,
  collectionBooks,
  koboUserSettings,
  koboSyncCollections,
  koboReadingState,
  koboSyncSnapshots,
  koboPendingRedeliveries,
  importJobs,
  appSettings,
  adminActivityLog
};
