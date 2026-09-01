# Апрель

React-клиент для личного планирования. Он переносит базу `react-starter`
Контракт принадлежит `hono-starter-free-hosting-mvp` и использует `/api`,
Telegram OIDC и RFC 9457 Problem Details.

## Cloudflare Free topology

```text
Browser → april-planner Worker + Static Assets
                         └─ /api/* → service binding → free-hosting-starter Hono Worker → D1
```

Frontend Worker — единственный browser origin: он выдаёт Vite `dist` как SPA и
проксирует `/api` через Cloudflare Service Binding. Это не требует Pages,
Docker, внешнего reverse proxy или платных ресурсов и сохраняет
`__Host-session` для Telegram OIDC.

## Авторизация

При AUTH_MODE=telegram frontend запрашивает GET /api/auth/me: ответ 401 UNAUTHENTICATED ведёт на /login, а кнопка запускает browser redirect на /api/auth/telegram/start. После callback backend должен перенаправить браузер на корень frontend Worker через AUTH_SUCCESS_REDIRECT_URL.

При AUTH_MODE=disabled Hono возвращает 404 NOT_FOUND не только для Telegram endpoints, но и для защищённого /api/notes/*. Frontend распознаёт этот контракт и показывает состояние отключённой авторизации, не подменяя его ложным публичным режимом.

## Локальная разработка

```bash
pnpm install
pnpm dev
```

Vite proxy направляет `/api` и `/health` на `http://localhost:8787`. Для
другого Hono origin скопируйте `.env.example` в `.env.local` и задайте
`DEV_API_PROXY_TARGET` как абсолютный HTTP(S) origin без path.

Запустите backend отдельно в
`/Users/denischernykh/Documents/ChatGPT/hono-starter-free-hosting-mvp`:

```bash
pnpm db:migrate:local
pnpm dev
```

## API contract

`openapi/openapi.json` получен непосредственно из Hono `createApp()`. При запущенном backend после изменения контракта выполните `pnpm api:update`; generated
Orval-файлы вручную не редактируются.

## Deploy

1. Сначала настройте и задеплойте Hono Worker c production именем
   `free-hosting-starter` в том же Cloudflare account.
2. В backend задайте `APP_ORIGIN` и `AUTH_SUCCESS_REDIRECT_URL` как public URL
   `april-planner` Worker и зарегистрируйте callback
   `/api/auth/telegram/callback` в Telegram.
3. Здесь выполните `pnpm check`; после успешного dry-run явно запустите
   `pnpm deploy`.

`pnpm deploy` создаёт удалённый Worker и намеренно не запускается автоматически.
Локальные checks и dry-run не доказывают remote deploy, D1 migration или
реальный Telegram login.
