# Ритм

Цели, привычки и результаты в вашем темпе. `planner` — название репозитория.

Модульный монолит: React SPA, Hono API, Telegram webhook и напоминания
публикуются одним Cloudflare Worker `app`. Данные — в существующей D1
`planner-db`. Один Git-репозиторий, pnpm workspace, lockfile и CI.

```text
Браузер ──┬── /, /plans/*       → Static Assets (React)
          └── /api/*            → Hono ──────────────┐
Telegram ──── /telegram/webhook → Hono              ├── D1
Cron раз в минуту ──────────────→ Reminders ────────┘
                     один Worker app
```

## Запуск

Нужны Node.js 24 и pnpm 11.15.1. Команды выполняются из корня:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

Открыть `http://localhost:8787`. `dev` собирает интерфейс и запускает один
локальный Worker с development-сессией. Telegram локально выключен.
После правок React перезапустите `pnpm dev` для новой сборки.
Локальная D1 остаётся в `backend/.wrangler/state`, существующие данные сохраняются.

Для работы над UI с HMR в двух терминалах: `pnpm dev:api` и `pnpm dev:ui`.
Открыть `http://localhost:5173`. Vite проксирует API в тот же локальный Worker;
режим `dev:api` настраивает доверенный origin для Vite.

## Структура и проверки

- `frontend/` — React/Vite, интерфейс и сгенерированный API-клиент.
- `chatgpt/` — личный плагин Ритм; UI берётся из frontend.
- `backend/src/modules/` — Identity, Planning, Notes, Reminders, Telegram Bot.
- `backend/src/index.ts` — HTTP, Cron и экспорт Durable Object единственного Worker.
- `backend/src/app/reminder-scheduler.ts` — фоновая обработка через alarms; Cron только будит её.
- `backend/wrangler.jsonc` — единственная конфигурация публикации, D1 и Static Assets.
- `backend/migrations/` — существующая история миграций.

`pnpm check` проверяет контракт OpenAPI, формат, архитектурные границы,
типизацию, тесты всех пакетов, сборки и маршрутизацию локального
монолита. Smoke использует временное локальное состояние; remote D1 и Telegram
не вызываются. CI выполняет тот же gate после frozen install.

Переход напоминаний на Durable Objects и удаление дробления под 10 мс описаны в
[решении и плане публикации](docs/durable-reminders-migration.md).
`pnpm reminders:compare-do` воспроизводит исторический локальный эксперимент на
зафиксированной старой ревизии; он использует синтетические данные и подставные
ответы Telegram и не входит в CI. [Методика](backend/experiments/durable-reminders/README.md).

После изменения API: `pnpm api:update`. Snapshot и клиент генерируются из
серверного кода той же Git-ревизии. `pnpm test` запускает тесты всех пакетов;
`pnpm build` собирает SPA; `pnpm deploy:dry-run` собирает production Worker
со Static Assets без публикации.

## Публикация

`pnpm deploy` собирает интерфейс и публикует один Worker. Публикация, remote
миграции и изменение Telegram webhook — отдельные ручные операции.
Первый переход с двух Worker описан в [инструкции миграции](docs/monolith-migration.md).
Публичный адрес остаётся `https://app.getplanner.workers.dev`.

## Git-история

Импортирующий коммит имеет двух родителей — исходные HEAD backend и frontend.
Обе истории доступны через `git log --all --graph`; старые SHA сохранены.
В исходном локальном checkout также сохранены ветки `history/backend` и
`history/frontend`. До объединения пути в этих историях
относились к корню соответствующего репозитория.

Исходные локальные Git-настройки и refs дополнительно сохранены в
`.git/legacy/backend` и `.git/legacy/frontend`. Этот архив локальный и не
отправляется в Git. Общий репозиторий продолжает
[`DenisChernykh/planner-backend`](https://github.com/DenisChernykh/planner-backend).
PR объединения принимается merge-коммитом: squash/rebase не сохранят исходную
историю frontend в графе `main`.

Документация: [API](backend/README.md), [интерфейс](frontend/README.md),
[напоминания](backend/docs/telegram-reminders.md).

Правила группировки application, потребители фабрик и владение D1 описаны в
[архитектурном решении](docs/application-architecture-decisions.md).
Результаты исправления issues и проверок: [отчёт от 08.10.2026](docs/issue-resolution-2026-10-08/report.md).

Проект ТЗ: [прогресс целей и отчёты в Telegram](docs/progress-and-telegram-reports.md).

Личный плагин **Ритм** для ChatGPT: [запуск и подключение](chatgpt/README.md).
Он переиспользует React UI веб-версии, работает с целями, результатами, корзиной
и напоминаниями. `pnpm chatgpt:build` готовит Sites Worker; `pnpm chatgpt:dev`
запускает личный адаптер локально. Раздел «Подключения» выдаёт отдельный
отзывной ключ. `pnpm check` включает проверки плагина.
