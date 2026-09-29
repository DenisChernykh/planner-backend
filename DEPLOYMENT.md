# Planner production

Cloudflare account: `crests.secrecy_3n@icloud.com`
(`a4c9bdc930a7c203670462011024234e`). Workers plan: Free.

| Resource | Target |
| --- | --- |
| Public frontend | `https://app.getplanner.workers.dev` |
| Frontend Worker | `app` |
| API Worker | `planner-api` |
| D1 database | `planner-db` |
| D1 ID | `80819e8e-d87f-4240-983e-919b358a42fc` |
| Telegram bot | `@planner_month_ru_bot` (Planner — план месяца) |

The frontend serves static assets and forwards `/api` through its `API` service
binding. Both Wrangler configurations pin the account. The backend trusts the
public frontend origin and redirects successful logins to its root.

## Resource names and database transfer on 2026-09-29

The API Worker was renamed to `planner-api` while preserving immutable Worker
ID `fe7af77ffb064bf8918716622a7ade5c`, deployment history, and all three secrets.
The frontend `API` service binding now targets `planner-api`. The public frontend
URL and Telegram callback remain unchanged.

D1 rejected an in-place rename. With owner approval, the database was copied to
`planner-db` (`80819e8e-d87f-4240-983e-919b358a42fc`). The API was placed in maintenance
mode during the transfer so no writes could be lost. Export statements were
ordered by foreign-key dependencies before import. A full comparison of row
contents and column definitions matched across all seven tables, including the
migration history and existing sessions.

The old database `free-hosting-starter-db`
(`2c196600-b755-4fe6-a9c3-463b25aab6ee`) was initially retained as a backup, then
deleted at the owner's request on 2026-09-29. Before deletion, all live Worker
bindings were checked: none referenced the old database, and `planner-api` used
`planner-db` with all seven application and migration tables present. Cloudflare
now lists only `planner-db` in this account.

API metadata now says `Planner API`; Problem Details types use
`urn:planner:problem:<code>`. The private v1 Telegram flow encryption label remains
stable for compatibility with login cookies issued before the rename.

Final deployments:

| Worker | Version |
| --- | --- |
| `planner-api` | `5dc80177-5224-43d5-b507-34b4e6980e06` |
| `app` | `bd81f88f-52e2-4ee2-ba4b-5f8d5fa2d15c` |

Both full `pnpm check` gates passed (75 backend and 69 frontend tests). Remote
checks confirmed the new database binding, preserved secret names, disabled
invocation logs, and no foreign-key violations. The SPA routes and API health
returned HTTP 200; unauthenticated `/api/auth/me` returned HTTP 401 with the new
Problem Details namespace. OpenAPI identifies `Planner API`. Telegram login
start returned HTTP 302 with the unchanged callback, state, nonce, and S256 PKCE.
A completed Telegram login was not repeated during this transfer.

## Deployment on 2026-09-28

The D1 database was created and migrations `0000`, `0001`, and `0002` were
successfully applied remotely. Both projects passed `pnpm check`: 75 backend
tests and 69 frontend tests. Both Workers were published after Telegram OIDC
was configured and all three secrets were stored through Wrangler's hidden
prompts.

| Worker | Deployed version |
| --- | --- |
| `free-hosting-starter` | `b78db31d-d77f-473d-a81f-c12f6aa146f5` |
| `app` | `17934d5f-98a4-4f66-9b3a-7092bbea9b87` |

## Shorter address

The owner selected `app.getplanner.workers.dev` and explicitly authorized moving
both Workers to the `getplanner` account subdomain. The existing frontend was
renamed from `planner-frontend` to `app`; its immutable Worker ID and deployment
history were preserved. The backend retains its name and immutable Worker ID.
The D1 database, existing data, secrets, and `API` service binding were preserved.

The old `*.crests-secrecy-3n.workers.dev` addresses are retired and do not redirect
to the new addresses. Both projects passed `pnpm check` again after the change:
75 backend tests and 69 frontend tests.

Checks on the new address confirmed SPA HTTP 200 at `/` and `/plans/2026-09`,
HTTP 401 Problem Details for unauthenticated `/api/auth/me`, and an OIDC HTTP 302
with the exact new callback, state, nonce, and S256 PKCE. The new backend health
URL returned HTTP 200. The new origin and callback were verified in BotFather
after a reload; the old URLs were removed. The owner confirmed the Telegram
request and reported that everything was working. The automation browser still
showed Telegram's confirmation screen, so a completed callback, authenticated
session, and Notes CRUD were not independently observed on the new address.

## Telegram OIDC

The existing Planner bot `@planner_month_ru_bot` was configured in the official
`@BotFather` mini app. Its Login Widget now uses OpenID Connect with RS256.
The following settings were saved and verified after a page reload:

| Setting | Value |
| --- | --- |
| Trusted Origin | `https://app.getplanner.workers.dev/` |
| Redirect URI | `https://app.getplanner.workers.dev/api/auth/telegram/callback` |

Keep the signing algorithm set to RS256. All three required secrets are present
in the production Worker. To change them later, use Wrangler's hidden prompts
from this backend directory:

```sh
pnpm exec wrangler secret put TELEGRAM_OIDC_CLIENT_ID --env production
pnpm exec wrangler secret put TELEGRAM_OIDC_CLIENT_SECRET --env production
pnpm exec wrangler secret put AUTH_FLOW_SECRET --env production
```

`AUTH_FLOW_SECRET` must be a freshly generated, random 32-byte value encoded as
base64url. Never put secret values in chat, shell arguments, logs, or Git. A Bot
API token is not an OIDC Client Secret. Bot API webhook mode remains disabled.

## Publish and verify

For subsequent authorized deployments, publish the backend before the frontend:

```sh
# In backend/
pnpm deploy

# In frontend/
pnpm deploy
```

The initial production smoke, before the address change, confirmed:

- `/` and `/plans/2026-09` return the frontend SPA with HTTP 200.
- The login page renders in Chrome.
- Unauthenticated `/api/auth/me` returns HTTP 401 Problem Details through the
  frontend's service binding.
- `/api/auth/telegram/start` returns HTTP 302 to `oauth.telegram.org` with the
  exact registered callback, state, nonce, S256 PKCE, and an auth-flow cookie.
- A real Telegram login returned to `/plans/2026-09`; `/api/auth/me` returned
  HTTP 200. The session survived a full browser reload.
- A temporary Note passed create, list, get, update, and delete checks; its
  subsequent get returned HTTP 404.
- A temporary goal and a completed entry were created through the same-origin
  API. A subsequent read returned the saved entry, and the goal and checkmark
  appeared in the UI after a full reload. Updating the goal returned HTTP 200;
  deleting it returned HTTP 204 and moved it from the plan to the trash.
- The UI's logout returned HTTP 204, redirected to `/login`, and a subsequent
  `/api/auth/me` returned HTTP 401. The D1 session count changed from one to zero.
- All temporary smoke records were removed, including the soft-deleted goal
  and its entry. A final targeted D1 query confirmed zero test notes, goals,
  and entries.

These are observed production checks using the project's Planner bot. A
separate dedicated test bot and replay of the old raw session cookie were not
used. Session cookies, OIDC credentials, and phone numbers were not logged or
saved to files. Temporary Chrome remote debugging was disabled after setup.

The backend health URL is
`https://planner-api.getplanner.workers.dev/health`.
It returned HTTP 200 with revision `53f13c0`. Health alone does not prove
authentication or database operations work.

Do not enable Cloudflare invocation logs or run `wrangler tail` during login:
OAuth callback URLs include sensitive parameters.
