CREATE INDEX `uploads_owner_created` ON `uploads` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `versions_owner_created` ON `versions` (`owner_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `versions_root_parent` ON `versions` (`root_id`,`parent_id`);