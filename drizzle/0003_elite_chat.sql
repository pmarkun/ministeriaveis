ALTER TABLE `auth_accounts` ADD `credential_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD `credential_version` integer DEFAULT 0 NOT NULL;