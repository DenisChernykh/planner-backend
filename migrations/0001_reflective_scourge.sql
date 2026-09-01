CREATE TABLE `goal_entries` (
	`goal_id` text NOT NULL,
	`local_date` text NOT NULL,
	`value` text NOT NULL,
	`met` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`goal_id`, `local_date`),
	FOREIGN KEY (`goal_id`) REFERENCES `plan_goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goal_entries_goal_date_idx` ON `goal_entries` (`goal_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `plan_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`month` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`tracking_type` text NOT NULL,
	`tracking_config` text NOT NULL,
	`cadence_period` text NOT NULL,
	`target_occurrences` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_goals_owner_month_idx` ON `plan_goals` (`owner_id`,`month`);--> statement-breakpoint
CREATE INDEX `plan_goals_owner_deleted_idx` ON `plan_goals` (`owner_id`,`deleted_at`);