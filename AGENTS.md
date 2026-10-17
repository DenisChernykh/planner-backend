# Planner workspace

- One Git repository, one pnpm workspace/lockfile, one Cloudflare Worker `app`.
- `backend/wrangler.jsonc` owns Hono, Static Assets, D1, webhook, one Cron and
  the SQLite-backed `ReminderScheduler` Durable Object. Cron only wakes it;
  heavy reminders/reports execute in alarms. See docs/durable-reminders-migration.md.
- Keep frontend and backend as source packages, with their existing architecture.
  Read their AGENTS.md before changing package code.
- Use Node 24 and pnpm 11.15.1. Install from the root. Run root `pnpm check`
  before handoff and `pnpm boundaries:check` after changing imports or moving code.
- Keep CI check-only. No deploy, remote migration or Telegram mutation
  without explicit authorization. Preserve the existing D1 and free-tier scope.
- Never print or commit secrets, .dev.vars, credentials or local session tokens.
- Use docs/monolith-migration.md for the initial hosted cutover; the two Worker
  records in backend/DEPLOYMENT.md are historical, not the current code topology.

## Git workflow

- The owner gives standing authorization to commit and push completed work in
  this repository. After each implementation or documentation task, run the
  required checks, create scoped commits, and push before handoff. Do not wait
  for a reminder or request authorization again for routine commits and pushes.
- Before editing, inspect the current branch, upstream, full Git status
  (including untracked files), and unpushed commits. Identify pre-existing work
  so it is not mixed into the new task.
- Stage only files or hunks belonging to the task, including its new files.
  Preserve unrelated pre-existing changes; do not commit, discard, or stash them
  just to make the tree clean. Finish with none of your task's changes left
  uncommitted or unpushed, and report any unrelated changes that remain.
- Verify the remote and destination branch. Use the configured upstream,
  including `origin/main` when working on `main`; for a new task branch, push
  the same branch name to the verified `origin` and set its upstream. This
  authorization does not cover force pushes, rewriting shared history,
  deleting remote branches or tags, or changing repository settings.
- If deployment is separately authorized, commit and push the checked changes
  before deploying that revision. A deployment is not a substitute for a commit.
- Verify that the remote branch contains the intended commit. In the final
  response, include the commit ID and pushed branch. If checks or push fail,
  resolve the failure within the task's scope or report the specific blocker;
  do not present unpublished work as finished or equate push with passing CI.
