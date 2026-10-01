ALTER TABLE `planning_entry_commands` ADD `goal_id` text REFERENCES plan_goals(id) ON DELETE CASCADE;--> statement-breakpoint
CREATE INDEX `planning_entry_commands_goal_idx` ON `planning_entry_commands` (`goal_id`);
