# Переход на один Worker

Код подготовлен для Worker `app` по адресу `https://app.getplanner.workers.dev`.
Единственная конфигурация — `backend/wrangler.jsonc`: SPA из `frontend/dist`,
Hono API, `/telegram/webhook`, `/health`, `/openapi.json`, существующая D1
`planner-db` и один ежеминутный Cron. Service Binding `API` больше не нужен.

Это инструкция для отдельной разрешённой публикации. Локальное объединение
репозиториев не меняет опубликованные Worker, secrets, webhook и Cron.

## Перед переключением

1. Выполнить `pnpm install --frozen-lockfile`, `pnpm check`,
   `pnpm deploy:dry-run`. Зафиксировать проверенную ревизию.
2. Проверить account и D1 UUID из конфигурации. Новая база и новые миграции
   для объединения не нужны. Записать текущие version IDs обоих Worker,
   webhook URL и состояние Cron для отката.
3. Убедиться, что все пять secrets из `secrets.required` установлены на `app`,
   используя скрытые prompts Wrangler из `backend/`. Ранее secrets были у
   `planner-api` и автоматически не переносятся. Для сохранения текущих
   сессий достаточно той же D1; тот же `AUTH_FLOW_SECRET` сохраняет также
   возможность завершить уже начатый вход. Секреты не выводить и не коммитить.
4. Сохранить текущие `APP_ORIGIN`, redirect и BotFather callback:
   `https://app.getplanner.workers.dev/api/auth/telegram/callback`.

## Переключение после разрешения

1. Отключить Cron старого `planner-api` отдельной операторской операцией.
   Не оставлять два активных scheduler для одной базы.
2. Из корня выполнить `pnpm deploy` (цель — `app`). Эта команда не запускает
   remote migrations и не меняет webhook Telegram.
3. Проверить `/`, прямое открытие `/plans/YYYY-MM`, `/health`,
   `/openapi.json`, защищённые API и реальный вход/выход через Telegram.
4. Отдельно зарегистрировать webhook на
   `https://app.getplanner.workers.dev/telegram/webhook` через
   `pnpm telegram:operator -- set <URL>`, затем выполнить `info`.
   Pending updates сохранять. Проверить реальную доставку и ответ бота.
5. Убедиться, что Cron активен только на `app`, напоминания доставляются,
   а invocation logs отключены. Старый Worker сохранять для отката до окончания
   проверки; его удаление — отдельная операция.

## Откат

Отключить Cron `app`, восстановить прежнюю версию frontend Worker `app` с
Service Binding `API`, вернуть webhook на сохранённый URL `planner-api` и
включить только его прежний Cron. Старый backend должен оставаться доступным
для Service Binding. D1 не откатывать: схема и данные при объединении не меняются.
Восстановление версии само по себе не доказывает восстановление Cron или webhook;
эти настройки проверяются отдельно.

Маршрутизация основана на `assets.run_worker_first`: серверные пути всегда
попадают в Hono, включая навигацию браузера. Остальные пути обслуживает SPA.
См. [Cloudflare Static Assets routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
