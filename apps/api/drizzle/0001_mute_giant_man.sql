PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`created_at` text NOT NULL,
	`disabled_at` text
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "username", "password_hash", "role", "created_at", "disabled_at") SELECT "id", "email", "username", "password_hash", "role", "created_at", "disabled_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
