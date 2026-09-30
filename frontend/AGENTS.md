# Project instructions

This React/Vite frontend belongs to the Planner pnpm workspace.

- Target one Cloudflare Worker Free + Static Assets. The sole Wrangler config
  is `../backend/wrangler.jsonc`; Hono, SPA, webhook and Cron share one deployment.
- Browser API requests use the same origin. Do not reintroduce an API Service
  Binding, cross-origin fetch or Pages: preserve the `__Host-session` cookie
  and trusted Origin check.
- Do not add paid Cloudflare resources, Pages, KV, R2, Queue, Durable Objects,
  Docker, custom domains or automatic deployment without explicit approval.
- Hono OpenAPI is the API source. Browser paths are `/api`, never the old
  starter `/v1`. Preserve request headers; do not add client CSRF unless
  the backend contract does.
- Before dependency changes, confirm Node 24 and pnpm 11.15.1; use plain pnpm.
- `pnpm deploy` is a remote mutation. Do not run it without explicit approval.

## UI design references

Before changing the Planner plan screen or goal-creation UI, inspect
[`docs/design/README.md`](docs/design/README.md) and open the linked PNG
references. Treat them as the current visual source of truth; keep colours
bound to the semantic tokens in `src/app/styles/index.css`.

### Editable Pen source

When Pencil MCP is available, inspect the editable source before implementing
or changing these screens:

- document: `docs/design/Planner.pen` (relative to this package)
- plan screen: `h9BBT` (`Editable Plan / September`)
- goal-creation screen: `elkpw` (`Create Goal / All Variants`)

Use Pencil MCP to read and edit this document; do not attempt to parse its
encrypted `.pen` file directly. The committed PNG exports are the fallback
when Pencil MCP is unavailable.
