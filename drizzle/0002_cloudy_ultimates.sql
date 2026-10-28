CREATE TABLE `auth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`recovery_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_email_unique` ON `auth_accounts` (`email`);--> statement-breakpoint
CREATE TABLE `auth_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`hits` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_limits_expiry` ON `auth_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `auth_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_account` ON `auth_sessions` (`account_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expiry` ON `auth_sessions` (`expires_at`);