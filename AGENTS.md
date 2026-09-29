# Planner workspace

- One Git repository, one pnpm workspace/lockfile, one Cloudflare Worker `app`.
- `backend/wrangler.jsonc` owns Hono, Static Assets, D1, webhook and one Cron.
- Keep frontend and backend as source packages, with their existing architecture.
  Read their AGENTS.md before changing package code.
- Use Node 24 and pnpm 11.15.1. Install from the root. Run root `pnpm check`
  before handoff and `pnpm boundaries:check` after changing imports or moving code.
- Keep CI check-only. No deploy, push, remote migration or Telegram mutation
  without explicit authorization. Preserve the existing D1 and free-tier scope.
- Never print or commit secrets, .dev.vars, credentials or local session tokens.
- Use docs/monolith-migration.md for the initial hosted cutover; the two Worker
  records in backend/DEPLOYMENT.md are historical, not the current code topology.
