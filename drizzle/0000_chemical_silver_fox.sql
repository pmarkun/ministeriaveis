CREATE TABLE `supports` (
	`version_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`version_id`, `user_id`),
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`content_type` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`owner_label` text NOT NULL,
	`title` text NOT NULL,
	`payload` text NOT NULL,
	`parent_id` text,
	`root_id` text NOT NULL,
	`version` integer NOT NULL,
	`relation` text NOT NULL,
	`created_at` text NOT NULL
);
