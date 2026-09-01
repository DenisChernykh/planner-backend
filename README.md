# Planner

React-клиент для личного планирования по месяцам. Сейчас в нём доступны shell
планировщика, создание цели, минимальные экраны плана и корзины. API-контракт
принадлежит соседнему Hono backend и использует `/api`, Telegram OIDC и RFC 9457
Problem Details.

## Маршруты

- `/` — переход к текущему месяцу;
- `/plans/:month` — план выбранного месяца;
- `/plans/:month/goals/new` — создание цели;
- `/plans/:month/trash` — корзина месяца.

Месяц передаётся в формате `YYYY-MM`. Некорректный месяц и неизвестный маршрут
показывают отдельное понятное состояние.

## Cloudflare Free topology

```text
Browser → planner-frontend Worker + Static Assets
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

Сначала запустите соседний backend из `../backend`:

```bash
pnpm db:migrate:local
pnpm dev:planner
```

`dev:planner` доверяет Vite origin `http://localhost:5173`, поэтому unsafe
запросы формы проходят проверку Origin через локальный proxy. Обычный backend
`pnpm dev` остаётся автономным режимом на `http://localhost:8787`.

## API contract

`openapi/openapi.json` генерируется непосредственно из Hono `createApp()` в
`../backend`; запущенный HTTP-сервер для этого не нужен. После изменения
контракта выполните:

```bash
pnpm api:update
```

Команда сначала обновляет snapshot, затем запускает Orval. Generated
TypeScript/Zod-файлы вручную не редактируются. Sync проверяет наличие всех
Planning operations, которые использует frontend.

## Цели

Форма поддерживает четыре способа учёта: `check`, `quantity`, `scale` и `time`,
а также периоды `day`, `week` и `month`. Для `time` обе границы необязательны:
можно разрешить любое время, задать только «не раньше», только «не позже» или
обе границы. Диапазон с началом позже конца проходит через полночь. Недельная
частота ограничена 1–7, месячная — фактическим числом дней выбранного месяца.

## Проверка

```bash
pnpm test
pnpm build
pnpm check
```

`pnpm check` обновляет и проверяет API snapshot, формат, lint, архитектурные
границы, тесты и Cloudflare dry-run. Это локальная проверка, не deploy.

## Deploy

1. Сначала настройте и задеплойте Hono Worker c production именем
   `free-hosting-starter` в том же Cloudflare account.
2. В backend задайте `APP_ORIGIN` и `AUTH_SUCCESS_REDIRECT_URL` как public URL
   `planner-frontend` Worker и зарегистрируйте callback
   `/api/auth/telegram/callback` в Telegram.
3. Здесь выполните `pnpm check`; после успешного dry-run явно запустите
   `pnpm deploy`.

`pnpm deploy` создаёт удалённый Worker и намеренно не запускается автоматически.
Локальные checks и dry-run не доказывают remote deploy, D1 migration или
реальный Telegram login.
