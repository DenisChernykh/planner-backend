ALTER TABLE `goal_reminders` ADD `revision` text DEFAULT 'initial' NOT NULL;--> statement-breakpoint
ALTER TABLE `reminder_settings` ADD `revision` text DEFAULT 'initial' NOT NULL;--> statement-breakpoint
CREATE INDEX `planning_entry_commands_retention_idx` ON `planning_entry_commands` (`created_at`) WHERE goal_id IS NULL;--> statement-breakpoint
CREATE INDEX `reminder_jobs_retention_idx` ON `reminder_jobs` (`created_at`);