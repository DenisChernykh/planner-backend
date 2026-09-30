CREATE TABLE `plan_month_rollovers` (
	`owner_id` text NOT NULL,
	`month` text NOT NULL,
	`operation_id` text NOT NULL,
	`source_month` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `month`),
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `plan_goals` ADD `carried_from_goal_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `plan_goals_carried_from_idx` ON `plan_goals` (`owner_id`,`month`,`carried_from_goal_id`);