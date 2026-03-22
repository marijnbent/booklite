CREATE TABLE IF NOT EXISTS `admin_activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text NOT NULL,
	`event` text NOT NULL,
	`level` text DEFAULT 'ERROR' NOT NULL,
	`message` text NOT NULL,
	`details_json` text,
	`actor_user_id` integer,
	`target_user_id` integer,
	`book_id` integer,
	`job_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_admin_activity_log_created_at` ON `admin_activity_log` ("created_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_admin_activity_log_scope_created_at` ON `admin_activity_log` (`scope`,"created_at" DESC,"id" DESC);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `api_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`jti` text NOT NULL,
	`label` text,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `api_tokens_jti_unique` ON `api_tokens` (`jti`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `book_progress` (
	`user_id` integer NOT NULL,
	`book_id` integer NOT NULL,
	`status` text DEFAULT 'UNSET' NOT NULL,
	`progress_percent` real DEFAULT 0 NOT NULL,
	`position_ref` text,
	`position_type` text,
	`position_source` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `book_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `book_shares` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`owner_user_id` integer NOT NULL,
	`recipient_user_id` integer NOT NULL,
	`shared_at` text NOT NULL,
	`removed_at` text,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_book_shares_book_recipient` ON `book_shares` (`book_id`,`recipient_user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_book_shares_recipient` ON `book_shares` (`recipient_user_id`,`removed_at`,`book_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_user_id` integer NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`series` text,
	`description` text,
	`cover_path` text,
	`file_path` text NOT NULL,
	`file_ext` text NOT NULL,
	`file_size` integer NOT NULL,
	`kobo_syncable` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `books_file_path_unique` ON `books` (`file_path`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collection_books` (
	`collection_id` integer NOT NULL,
	`book_id` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`collection_id`, `book_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`slug` text,
	`is_system` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_collections_user_slug` ON `collections` (`user_id`,`slug`) WHERE "collections"."slug" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`status` text NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`result_json` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kobo_pending_redeliveries` (
	`user_id` integer NOT NULL,
	`book_id` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `book_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kobo_reading_state` (
	`user_id` integer NOT NULL,
	`book_id` integer NOT NULL,
	`payload_json` text NOT NULL,
	`last_modified_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `book_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kobo_sync_collections` (
	`user_id` integer NOT NULL,
	`collection_id` integer NOT NULL,
	PRIMARY KEY(`user_id`, `collection_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kobo_sync_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kobo_user_settings` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`sync_enabled` integer DEFAULT 0 NOT NULL,
	`sync_all_books` integer DEFAULT 0 NOT NULL,
	`two_way_progress_sync` integer DEFAULT 0 NOT NULL,
	`mark_reading_threshold` real DEFAULT 1 NOT NULL,
	`mark_finished_threshold` real DEFAULT 99 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `kobo_user_settings_token_unique` ON `kobo_user_settings` (`token`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `refresh_tokens_token_hash_unique` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`created_at` text NOT NULL,
	`disabled_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS `book_search` USING fts5(
	`title`,
	`author`,
	`series`,
	`description`,
	content='books',
	content_rowid='id'
);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `books_ai` AFTER INSERT ON `books` BEGIN
	INSERT INTO `book_search`(rowid, title, author, series, description)
	VALUES (new.id, new.title, COALESCE(new.author, ''), COALESCE(new.series, ''), COALESCE(new.description, ''));
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `books_ad` AFTER DELETE ON `books` BEGIN
	INSERT INTO `book_search`(`book_search`, rowid, title, author, series, description)
	VALUES('delete', old.id, old.title, COALESCE(old.author, ''), COALESCE(old.series, ''), COALESCE(old.description, ''));
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `books_au` AFTER UPDATE ON `books` BEGIN
	INSERT INTO `book_search`(`book_search`, rowid, title, author, series, description)
	VALUES('delete', old.id, old.title, COALESCE(old.author, ''), COALESCE(old.series, ''), COALESCE(old.description, ''));
	INSERT INTO `book_search`(rowid, title, author, series, description)
	VALUES (new.id, new.title, COALESCE(new.author, ''), COALESCE(new.series, ''), COALESCE(new.description, ''));
END;--> statement-breakpoint
INSERT INTO `book_search`(`book_search`) VALUES('rebuild');--> statement-breakpoint
INSERT OR IGNORE INTO `book_shares` (
	`book_id`,
	`owner_user_id`,
	`recipient_user_id`,
	`shared_at`,
	`removed_at`
)
SELECT DISTINCT
	cb.`book_id`,
	b.`owner_user_id`,
	c.`user_id`,
	CURRENT_TIMESTAMP,
	NULL
FROM `collection_books` cb
INNER JOIN `collections` c ON c.`id` = cb.`collection_id`
INNER JOIN `books` b ON b.`id` = cb.`book_id`
WHERE c.`user_id` != b.`owner_user_id`;--> statement-breakpoint
UPDATE `book_progress`
SET `status` = 'READ'
WHERE `status` = 'DONE';
