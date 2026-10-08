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

Before changing the UI, inspect [`docs/design/README.md`](docs/design/README.md)
and the relevant frames in pen.dev. The editable `docs/design/Planner.pen` is
the visual source of truth; keep colours bound to the semantic tokens in
`src/app/styles/index.css`.

### Editable Pen source

Use pen.dev (Pen/Pencil MCP) to inspect the editable source before implementing
or changing these screens:

- document: `docs/design/Planner.pen` (relative to this package)
- plan screen: `h9BBT` (`Editable Plan / September`)
- goal-creation screen: `elkpw` (`Create Goal / All Variants`)

Use Pen/Pencil MCP to read and edit this document; do not attempt to parse its
encrypted `.pen` file directly. Create and maintain mockups in pen.dev only.
Do not generate raster mockups with Image Gen or save/commit PNG mockup exports.
If Pen MCP is unavailable, report that limitation and work from the written
specification until the editable design can be inspected. After design changes,
save the `.pen` document and update the relevant frame IDs and documentation.
