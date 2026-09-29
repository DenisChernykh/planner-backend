CREATE TABLE `goal_reminders` (
	`goal_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`mode` text NOT NULL,
	`time` text NOT NULL,
	`weekdays` text NOT NULL,
	`next_run_at` integer,
	FOREIGN KEY (`goal_id`) REFERENCES `plan_goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goal_reminders_due_idx` ON `goal_reminders` (`next_run_at`);--> statement-breakpoint
CREATE TABLE `planning_entry_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reminder_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`event_key` text NOT NULL,
	`owner_id` text NOT NULL,
	`goal_id` text,
	`local_date` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`due_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`lease_until` integer,
	`chat_id` text,
	`message_id` integer,
	`expected_revision` text,
	`payload` text DEFAULT '[]' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `plan_goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_jobs_event_key_unique` ON `reminder_jobs` (`event_key`);--> statement-breakpoint
CREATE INDEX `reminder_jobs_due_idx` ON `reminder_jobs` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `reminder_jobs_reply_idx` ON `reminder_jobs` (`chat_id`,`message_id`);--> statement-breakpoint
CREATE TABLE `reminder_settings` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`time_zone` text DEFAULT 'Asia/Yekaterinburg' NOT NULL,
	`quiet_start` text DEFAULT '23:00' NOT NULL,
	`quiet_end` text DEFAULT '08:00' NOT NULL,
	`evening_time` text DEFAULT '21:00' NOT NULL,
	`next_evening_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `telegram_link_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_link_tokens_owner_id_unique` ON `telegram_link_tokens` (`owner_id`);--> statement-breakpoint
CREATE TABLE `telegram_links` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`telegram_user_id` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_chat_id_unique` ON `telegram_links` (`chat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_telegram_user_id_unique` ON `telegram_links` (`telegram_user_id`);--> statement-breakpoint
ALTER TABLE `goal_entries` ADD `revision` text DEFAULT 'initial' NOT NULL;