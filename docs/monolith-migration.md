# Переход на один Worker

Переход выполнен 2026-09-30 (Asia/Yekaterinburg). Production:
<https://app.getplanner.workers.dev>. Проверенная ревизия приложения —
`591d2af1036d3c82cedd0382feaf9e43e574efa0` из PR #15.

Единственная конфигурация — `backend/wrangler.jsonc`: SPA из `frontend/dist`,
Hono API, `/telegram/webhook`, `/health`, `/openapi.json`, существующая D1
`planner-db` и один ежеминутный Cron. Service Binding `API` в монолите отсутствует.

## Фактически выполненное переключение

Секреты находились у `planner-api`; у прежнего frontend `app` их не было.
Поэтому монолит опубликован поверх существующего backend, а затем Worker
переименованы. Значения secrets не извлекались и не переносились.

1. Проверены frozen install, `pnpm check`, production dry-run и GitHub CI
   объединённого `main`. Сохранены старые версии, bindings и расписания.
2. Временная конфигурация, производная от production-конфигурации, указала
   существующий `planner-api` и `BUILD_REVISION=591d2af`. Остальные настройки,
   D1 UUID, пять обязательных secrets и один Cron сохранены. Опубликованы
   проверенный backend и собранная SPA; `/health` подтвердил ревизию.
3. Прежний frontend переименован в `app-legacy`, прежний backend — в `app`.
   Использован Cloudflare Workers API с неизменными Worker IDs. Secrets остались
   у того же Worker; Service Binding архивного frontend автоматически стал
   ссылаться на `app`.
4. Через временный Wrangler remote preview существующего Worker выполнены
   `getWebhookInfo` и `setWebhook` для
   `https://app.getplanner.workers.dev/telegram/webhook`. Operator использовал
   существующие secret bindings только внутри Cloudflare, имел случайный
   bearer, ограниченный срок действия и фиксированные разрешённые URL.
   Он не публиковался как production-версия. `drop_pending_updates=false`,
   `allowed_updates=["message", "callback_query"]`.
5. `getWebhookInfo` подтвердил новый URL и нулевую очередь без ошибок.
   Временный preview-процесс остановлен. Публичный workers.dev адрес и preview
   URLs `app-legacy` отключены; архивный Worker сохранён для отката, Cron у него нет.

D1 `80819e8e-d87f-4240-983e-919b358a42fc` не заменялась. Remote migrations не
запускались. История миграций неизменна, `foreign_key_check` не выявил нарушений.
Invocation logs у `app` отключены. `APP_ORIGIN`, redirect и OIDC callback
сохранены: `https://app.getplanner.workers.dev/api/auth/telegram/callback`.

## Состояние и проверки

| Ресурс | Состояние |
| --- | --- |
| Активный Worker `app` | ID `fe7af77ffb064bf8918716622a7ade5c` (бывший backend) |
| Production version | `1913ee64-8342-45b8-8d33-fbc5ea0939ff` |
| Production deployment | `bf905196-feef-43df-96c7-7c1ce3e03de8` |
| Cron `app` | `* * * * *`, единственный |
| `app-legacy` | ID `684d0ac7cbf44cd584e8105843737ffb`, публичный доступ выключен |
| Прежний backend version | `6393c09a-2e42-4dec-90d1-0abcfae16282` |
| Прежний frontend version | `9e8e5cb3-29ed-4f38-926a-3d0d664e0053` |

Production smoke подтвердил:

- `/`, `/login`, `/plans/2026-09` и `/plans/2026-09/reminders` возвращают
  точную собранную SPA; её JavaScript доступен;
- `/health` возвращает `200` и ревизию `591d2af`, `/openapi.json` доступен;
- `/api/auth/me` без сессии и webhook без secret header возвращают `401`;
- отсутствующие серверные маршруты возвращают Problem Details `404`, не SPA;
- начало Telegram OIDC возвращает `302` на Telegram с правильным callback,
  PKCE S256, state, nonce и Secure/HttpOnly flow cookie;
- страница входа открывается в чистом браузере без ошибок JavaScript.

Полный реальный вход, authenticated CRUD, выход и доставка напоминания после
переключения не проверялись. Проверка redirect и регистрация webhook не
заменяют эти сценарии.

## Последующие публикации

Из корня: `pnpm install --frozen-lockfile`, `pnpm check`,
`pnpm deploy:dry-run`, затем после разрешения `pnpm deploy`.
Цель штатной команды теперь — действующий монолит `app` с существующими secrets.
Команда не запускает remote migrations и не меняет webhook Telegram.
Повторять первоначальное переименование не нужно.

## Откат первоначального перехода

Откат требует отдельного разрешения и проверки текущих версий: приведённые IDs
фиксируют именно состояние первого переключения.

1. Сохранить текущие настройки. Временно отключить единственный Cron `app`.
2. Переименовать backend identity `fe7af77ffb064bf8918716622a7ade5c` обратно
   в `planner-api`; frontend identity `684d0ac7cbf44cd584e8105843737ffb` —
   из `app-legacy` обратно в `app`. Проверить Service Binding `API` → `planner-api`.
3. Восстановить старые backend/frontend версии из таблицы и включить workers.dev
   адреса обоих Worker. Проверить публичный frontend и API.
4. Вернуть webhook на `https://planner-api.getplanner.workers.dev/telegram/webhook`,
   сохраняя pending updates. Подтвердить через `getWebhookInfo`.
5. Включить и проверить ровно один Cron на `planner-api`; у frontend Cron нет.
   Проверить invocation logs, авторизацию и реальную доставку.

D1 не откатывать: схема и данные при объединении не менялись. Восстановление
версии само по себе не доказывает восстановление публичного адреса, Cron,
service binding или webhook; эти настройки проверяются отдельно.

Маршрутизация основана на `assets.run_worker_first`: серверные пути всегда
попадают в Hono, включая навигацию браузера. Остальные пути обслуживает SPA.
См. [Cloudflare Static Assets routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
и [Cloudflare Worker rename API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/methods/edit/).
