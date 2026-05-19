PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_kobo_user_settings` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`sync_enabled` integer DEFAULT 1 NOT NULL,
	`sync_all_books` integer DEFAULT 0 NOT NULL,
	`two_way_progress_sync` integer DEFAULT 0 NOT NULL,
	`mark_reading_threshold` real DEFAULT 1 NOT NULL,
	`mark_finished_threshold` real DEFAULT 99 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_kobo_user_settings`("user_id", "token", "sync_enabled", "sync_all_books", "two_way_progress_sync", "mark_reading_threshold", "mark_finished_threshold", "updated_at") SELECT "user_id", "token", "sync_enabled", "sync_all_books", "two_way_progress_sync", "mark_reading_threshold", "mark_finished_threshold", "updated_at" FROM `kobo_user_settings`;--> statement-breakpoint
DROP TABLE `kobo_user_settings`;--> statement-breakpoint
ALTER TABLE `__new_kobo_user_settings` RENAME TO `kobo_user_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `kobo_user_settings_token_unique` ON `kobo_user_settings` (`token`);