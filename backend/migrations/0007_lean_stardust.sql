CREATE TABLE `goal_progress_reports` (
	`goal_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`included` integer NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `plan_goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goal_progress_reports_owner_idx` ON `goal_progress_reports` (`owner_id`,`included`);--> statement-breakpoint
CREATE TABLE `progress_report_settings` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`wednesday_time` text DEFAULT '21:00' NOT NULL,
	`sunday_time` text DEFAULT '21:00' NOT NULL,
	`next_wednesday_at` integer,
	`next_sunday_at` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `progress_reports_wednesday_idx` ON `progress_report_settings` (`enabled`,`next_wednesday_at`);--> statement-breakpoint
CREATE INDEX `progress_reports_sunday_idx` ON `progress_report_settings` (`enabled`,`next_sunday_at`);--> statement-breakpoint
CREATE TABLE `progress_settings` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`starts_on` text,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
