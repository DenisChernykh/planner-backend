ALTER TABLE `plan_goals` ADD `sort_order` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE plan_goals AS current_goal
SET sort_order = (
  SELECT COUNT(*)
  FROM plan_goals AS prior_goal
  WHERE prior_goal.owner_id = current_goal.owner_id
    AND prior_goal.month = current_goal.month
    AND prior_goal.cadence_period = current_goal.cadence_period
    AND (
      prior_goal.created_at < current_goal.created_at
      OR (prior_goal.created_at = current_goal.created_at AND prior_goal.id <= current_goal.id)
    )
);
