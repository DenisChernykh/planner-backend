# Ритм — серверная часть

Серверная часть единого Worker Ритма: цели, учёт прогресса, заметки
и авторизация через Telegram. Этот же Worker отдаёт React SPA из `../frontend/dist`.
Данные хранятся в существующей Cloudflare D1.

Установка и полный gate выполняются из [корня workspace](../README.md):
`pnpm install --frozen-lockfile`, `pnpm db:migrate:local`, `pnpm dev`, `pnpm check`.
Перед серверными тестами из этой папки соберите SPA командой `pnpm --dir .. build`.

Стартовый сценарий рассчитан на Cloudflare Workers Free, D1 Free и стандартный
домен `workers.dev`. Обязательных платных ресурсов в составе нет.

## Что внутри

- TypeScript 7 и Node.js 24 для локальной разработки;
- Hono и `@hono/zod-openapi` для HTTP API и OpenAPI 3.1;
- Cloudflare Workers как runtime;
- D1 и Drizzle ORM с SQL-миграциями;
- Telegram OpenID Connect Authorization Code Flow с PKCE как эталонный модуль;
- независимая Telegram Bot API webhook capability с отключённым по умолчанию режимом;
- cookie-сессия и защищённый CRUD заметок;
- Telegram-напоминания, ввод четырёх типов данных, вечерний сбор и настройки времени;
- общий расчёт прогресса, дата начала учёта и отдельные отчёты по средам и воскресеньям;
- Vitest в Cloudflare Workers runtime;
- Biome, строгая типизация и автоматическая проверка границ модулей;
- один локальный и CI-gate: `pnpm check`.

Здесь намеренно нет Docker, PostgreSQL, Redis, BullMQ, Queues, KV, R2, Durable
Objects, testcontainers, Swagger UI и автоматического production deploy.
Для личных Telegram-напоминаний согласован и настроен один Cron раз в минуту.
Добавляйте их только тогда, когда потребность подтверждена конкретным проектом.

## HTTP API

| Метод | Маршрут | Доступ | Назначение |
| --- | --- | --- | --- |
| `GET` | `/health` | публичный | Состояние Worker и revision сборки |
| `GET` | `/openapi.json` | публичный | OpenAPI 3.1 контракт |
| `GET` | `/api/auth/telegram/start` | публичный | Начать Telegram OIDC + PKCE |
| `GET` | `/api/auth/telegram/callback` | публичный | Проверить callback и создать сессию |
| `POST` | `/telegram/webhook` | webhook secret | Принять Telegram Bot API update (только при включённой capability) |
| `GET` | `/api/auth/me` | сессия | Текущий пользователь |
| `POST` | `/api/auth/logout` | сессия | Завершить текущую сессию |
| `GET` | `/api/notes` | сессия | Список своих заметок |
| `POST` | `/api/notes` | сессия | Создать заметку |
| `GET` | `/api/notes/{noteId}` | сессия | Получить свою заметку |
| `PATCH` | `/api/notes/{noteId}` | сессия | Изменить свою заметку |
| `DELETE` | `/api/notes/{noteId}` | сессия | Удалить свою заметку |
| `GET` | `/api/plans/{month}` | сессия | Получить цели и записи виртуального месяца |
| `GET` | `/api/search` | сессия или ключ аккаунта | Поиск своих целей и записей по всем месяцам |
| `GET` | `/api/search/goals` | сессия или ключ аккаунта | Цели для фильтра поиска, без записей |
| `POST` | `/api/plans/{month}/goals` | сессия | Создать цель в месяце |
| `PATCH` | `/api/goals/{goalId}` | сессия | Изменить цель без смены её типа |
| `DELETE` | `/api/goals/{goalId}` | сессия | Переместить цель в корзину |
| `GET` | `/api/plans/{month}/trash` | сессия | Получить удалённые цели |
| `POST` | `/api/goals/{goalId}/restore` | сессия | Восстановить цель |
| `PUT` | `/api/goals/{goalId}/entries/{date}` | сессия | Полностью заменить выполнение за день |
| `DELETE` | `/api/goals/{goalId}/entries/{date}` | сессия | Очистить выполнение за день |
| `GET`, `PUT` | `/api/reminders/settings` | сессия | Настройки времени и состояние Telegram |
| `GET` | `/api/reminders/goals/{month}` | сессия | Напоминания целей месяца |
| `PUT` | `/api/reminders/goals/{goalId}` | сессия | Режим, время и дни вопросов |
| `POST` | `/api/reminders/telegram/connect` | сессия | Одноразовая ссылка подключения чата |
| `DELETE` | `/api/reminders/telegram` | сессия | Отключить чат и приостановить напоминания |

Пользователь видит только свои заметки. Чужой или отсутствующий `noteId`
возвращает одинаковый `404`, чтобы не раскрывать существование чужих данных.
Заголовок содержит от 1 до 120 символов, тело — не более 10 000 символов.
Параметр списка `limit` принимает значения от 1 до 100, по умолчанию — 20.
Ошибки API имеют формат Problem Details (`application/problem+json`, RFC 9457).
Каждый такой ответ содержит стабильный машинный `code`, `instance` с безопасным
pathname и fragment из `requestId` для конкретного возникновения проблемы, а
также отдельный `requestId` для корреляции запроса. Query-параметры в
`instance` не попадают. Клиентский код должен ветвиться по `code`, а не
разбирать человекочитаемые `title` или `detail`.

Например, отсутствующая и принадлежащая другому пользователю заметка намеренно
дают одинаковую бизнес-проблему:

```json
{
  "type": "urn:planner:problem:note-not-found",
  "title": "Note not found",
  "status": 404,
  "detail": "The note was not found.",
  "instance": "/api/notes/019...#opaque-request-id",
  "code": "NOTE_NOT_FOUND",
  "requestId": "opaque-request-id"
}
```

`NOTE_NOT_FOUND` принадлежит модулю Notes. Транспортные ошибки используют
общие коды вроде `VALIDATION_FAILED`, `UNSUPPORTED_MEDIA_TYPE` и
`UNTRUSTED_ORIGIN`. Полный состав ответов является частью `/openapi.json`.

### Прогресс и отчёты

| Метод | Маршрут | Назначение |
| --- | --- | --- |
| `GET` | `/api/progress/settings` | Общая дата начала учёта и её ревизия |
| `PUT` | `/api/progress/settings` | Сохранить `startsOn: YYYY-MM-DD` или `null` |
| `GET` | `/api/progress` | Обзор `period=week|month`, обязательная дата `anchor`, необязательный список UUID `goals` через запятую |
| `GET` | `/api/progress/goals/{goalId}` | Цель и её цепочка переноса для того же периода |
| `GET` | `/api/reminders/progress-reports?month=YYYY-MM` | Настройки, выбор целей месяца и ближайшие отправки |
| `PUT` | `/api/reminders/progress-reports` | Атомарно сохранить расписание, выбор этого месяца и общую дату |
| `POST` | `/api/reminders/progress-reports/preview` | Сформировать черновик для `slot=wed|sun` без записи и отправки |

Все маршруты требуют аккаунт; небезопасные запросы проверяют Origin. Чужая,
удалённая и отсутствующая цель дают одинаковый `404`. Обзор читает только
существующие месяцы, не запускает перенос и не включает заметки. Отсутствие факта
отличается от сохранённого `false` или `0`; критерии выполнения берутся из
`planning`, а редактирование правила атомарно пересчитывает сохранённый `met`.

Отчёты по умолчанию выключены и используют существующий Cron и D1. Их включение
независимо от напоминаний о заполнении; чат, пояс и тихие часы общие. Время по
умолчанию — 21:00 в среду и воскресенье, выбор целей пустой. Повторная попытка
подтверждённой ошибки использует сохранённый снимок, а результат `unknown`
автоматически не повторяется. Текст ограничен 3500 символами и целыми блоками
целей. Кнопки ведут в веб-прогресс и настройки; Telegram-разметка для названий
не применяется.

Миграция `0007_lean_stardust.sql` добавляет три таблицы с выключенными отчётами
и пустой датой. Она применяется вручную перед выпуском этой версии; локальное
применение не означает изменения production. Полные правила и критерии приёмки:
[ТЗ](../docs/progress-and-telegram-reports.md).

### Планирование

Глобальный поиск `GET /api/search` принимает `q` до 160 символов: название и
описание цели либо заметка записи. Регистр и различия «е/ё» не учитываются;
точное название, часть названия, описание и заметка имеют убывающий приоритет.
При равном приоритете свежие результаты идут первыми. Ответ содержит
`results`, `total`, `counts`, `nextOffset`, `suggestion` и `today` в часовом поясе
аккаунта. Параметры `offset` и `limit` задают страницу; `limit` по умолчанию 50,
максимум 100. Исправление опечатки только предлагается, запрос не подменяется.

Фильтры: `kind=all|goals|entries`, включительные даты `from`/`to`, `tracking`,
`cadence`, `goalId`, `presence=any|present|missing`, `met=any|met|unmet`,
`note=any|present|absent` и `includeDeleted=true|false`. Фильтры записей
ограничивают выдачу записями. `comparison=lt|gt|eq|between` требует конкретную
цель и `value`; для включительного диапазона нужен `valueTo`. Числа сравниваются
в единицах выбранной цели, время — как `HH:mm` в пределах суток; галочка не
поддерживает сравнение значения. `missing` возвращает только прошедшие дни и
сегодня без сохранённой записи, ищет текст по цели и несовместим с `met`, `note`
и сравнением значения. Сохранённые `false` и `0` остаются записями.

По умолчанию корзина исключена. `GET /api/search/goals` поддерживает тот же
`includeDeleted`. Результаты, варианты целей и исправления опечаток ограничены
текущим владельцем. Поиск не создаёт месяцы и не восстанавливает цели; новая
схема D1 для него не нужна.

Месяц задаётся в формате `YYYY-MM`. Текущий месяц автоматически подготавливается
при чтении плана или его напоминаний, а для подключённого Telegram — существующим
Cron. Активные цели и настройки напоминаний переходят из последнего известного
прошлого месяца; отметки остаются в истории. Заполненный вручную новый месяц
не дополняется автоматически. Подробности: [переход между месяцами](docs/month-rollover.md).

Цель создаётся запросом
`POST /api/plans/{month}/goals` и содержит название, необязательное описание,
точную периодичность (`day`, либо `week`/`month` с одним
`targetOccurrences`) и один неизменяемый после создания тип выполнения:

```json
{
  "title": "Прочитать",
  "tracking": {
    "type": "quantity",
    "unit": "страницы",
    "targetValue": 20,
    "comparison": "atLeast"
  },
  "cadence": { "period": "day" }
}
```

Доступны типы `check` (boolean), `quantity` (число с точной целью и сравнением),
`scale` (целое число в диапазоне) и `time` (локальное `HH:mm`). Для `time` обе
границы необязательны: без них подходит любое время, одна задаёт только «не
раньше» или «не позже», а две — включительный диапазон. Интервал вроде
`22:00`–`01:00` проходит через полночь. Недельный cadence принимает 1–7
повторений, месячный — не больше фактического числа дней выбранного месяца.
`PUT /api/goals/{goalId}/entries/{date}` заменяет значение и заметку дня.
Тело обязательно содержит `expectedRevision`: ревизию из прочитанной записи
или `null` для новой. Ответ содержит `value`, `note`, `met` и новую `revision`.
`DELETE` этой записи требует query-параметр `expectedRevision`.
Устаревшая запись, создание поверх существующей записи и удаление по старому
снимку возвращают `409 ENTRY_CONFLICT`; клиент сохраняет черновик и предлагает
перечитать/сравнить изменения. Повтор успешного PUT с прежней ревизией также
конфликтует: сначала нужно прочитать актуальную запись.

Изменение параметров цели сохраняет значения, даты и заметки и пересчитывает
`met` этой месячной версии по новому условию. Выполнения разрешены только за
даты цели в часовом поясе пользователя из настроек, не позже текущего дня.
Удаление цели — мягкое: история
попадает в `/trash` и возвращается через `/restore`.

`pnpm dev` запускает Wrangler с локально переданным `AUTH_MODE=development`.
При первом запросе к защищённому API Worker создаёт в локальной D1 обычную сессию для
фиксированного тестового пользователя `local-developer`. Поэтому можно сразу
разрабатывать и вручную проверять новые модули, Notes и Origin-проверки без
Telegram, HTTPS, туннелей или deploy. Это не проверка Telegram OIDC.

Для работы с Vite frontend Planner на `http://localhost:5173` используйте
`pnpm dev:planner`: он задаёт тот же origin как `APP_ORIGIN`, поэтому backend
принимает unsafe-запросы, проходящие через Vite proxy. Обычный `pnpm dev`
оставляет backend автономным на `http://localhost:8787`.

Production preset не содержит этого режима. Runtime разрешает
`AUTH_MODE=development` только с `BUILD_REVISION=local` и
`http://localhost` origin, а development-сессию выдаёт лишь запросу с тем же
локальным origin.

## Архитектура, которая растёт вместе с проектом

Это feature-first modular monolith с прогрессивным количеством слоёв:

```text
src/
  app/                         # composition root и сборка Worker
  modules/
    identity-access/
      index.ts                 # публичная поверхность модуля
      public-contracts.ts      # контракты для других модулей
      presentation/            # HTTP и cookies
      application/
        telegram-login/        # начало, проверка и завершение OIDC-входа
        sessions/              # проверка и отзыв сессий
        development/           # локальная сессия разработчика
        ports/
      infrastructure/          # D1, OIDC, crypto
    notes/
      index.ts
      presentation/
      application/
        reading/               # получение заметки и списка
        writing/               # создание, изменение и удаление
        ports/
      domain/                  # модель, ошибки и правила содержимого
      infrastructure/
    planning/
      index.ts
      public-contracts.ts
      presentation/
      application/
        plans/                 # план месяца и корзина
        goals/                 # создание, изменение, порядок и восстановление
        entries/               # записи целей и ответы на напоминания
        ports/
      domain/                  # цели, значения, даты, расчёт выполнения
      infrastructure/
    reminders/
      index.ts
      public-contracts.ts
      presentation/
      application/
        settings/
        connection/
        scheduling/
        delivery/
        answers/
        ports/
      domain/                  # настройки, расписание, сроки и правила доставки
      infrastructure/
    telegram-bot/
      index.ts
      public-contracts.ts
      presentation/            # HTTP-контракт и проверка webhook
      infrastructure/          # grammY, обработка обновлений и доставка
  platform/
    config/                    # runtime-конфигурация
    database/                  # общая D1 schema/connection
    http/                      # transport-wide middleware
    logging/                   # структурированные события
  shared/                      # маленькие стабильные примитивы
```

Маленькая фича может начинаться с нескольких файлов внутри своего модуля. Слои
появляются там, где уже есть отдельная ответственность, а не ради симметрии.
При этом действуют стабильные правила:

- другой модуль импортируется только через его `index.ts` или
  `public-contracts.ts`; application использует только `public-contracts.ts`,
  чтобы не получить транзитивную зависимость от исполняемого wiring;
- `presentation` получает готовые use case и query и вызывает `execute(input)`;
  сборка их зависимостей находится в корневом `index.ts` модуля, а чтение
  репозиториев и сборка ресурсов — в application;
- `domain` содержит модели и чистые бизнес-правила. Он не импортирует
  application, infrastructure, presentation или runtime-конфигурацию; время
  и идентификаторы получает аргументами. Luxon используется для расчёта календаря;
- `application` загружает данные, вызывает domain и выполняет действия через порты;
- application-код не знает о Hono, D1 и Telegram SDK/HTTP;
- доменные и application-ошибки принадлежат своему модулю, а presentation-слой переводит
  их в безопасные Problem Details с фиксированными публичными текстами;
- infrastructure реализует объявленные application ports;
- каждый `index.ts` скрывает внутренний wiring своего модуля, а `src/app`
  соединяет только публичные module factories, без контейнера DI и декораторов;
- generic repository отсутствует: ports выражают операции конкретной capability.

Самостоятельные сценарии обычно записываются в `*.use-case.ts`, операции чтения —
в `*.query.ts`. Папки внутри application объединяют связанные сценарии,
их модели и вспомогательные функции; контракты внешних зависимостей лежат
в `ports/`. Тесно связанные определения можно держать вместе: отдельный файл
выделяется по обязанности и причине изменения. Оценка конкретных объединений,
потребители фабрик и карта владельцев таблиц зафиксированы в
[архитектурном решении](../docs/application-architecture-decisions.md).

У `telegram-bot` нет собственного application: это транспортный адаптер.
Его входящие обновления передаются в контроллер `reminders`, где команды
преобразуются в вызовы продуктовых сценариев. Для API Hono роль контроллеров
выполняют обработчики в `presentation/http.ts`.

OIDC flow, cookies, Telegram-команды и DTO сообщений не являются моделями
предметной области. Они остаются в сценариях авторизации и адаптации протоколов.
Атомарные операции, проверка версии и защита от повторной записи выполняются
через порты хранилища; перенос правил в domain не заменяет гарантии D1.

Центрального registry бизнес-ошибок намеренно нет. Локального исчерпывающего
маппера достаточно, пока модули собираются одним приложением. Registry имеет
смысл добавлять позже как контроль уникальности `code`/`type` и сборщик общего
каталога, если модулей и независимо работающих команд станет много.

`pnpm boundaries:check` защищает эти правила. Такая структура остаётся лёгкой
для MVP, но не требует болезненной перекладки каталогов, когда проект вырастет.

## Локальный запуск

Нужны Node.js 24 и pnpm 11.15.1. Следующие команды выполняются из корня workspace:

```bash
pnpm install
pnpm db:migrate:local
pnpm dev
```

После запуска проверьте:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/openapi.json
```

Для отдельной локальной проверки Telegram auth скопируйте `.dev.vars.example`
в `.dev.vars`, заполните значения только на своей машине и запустите
`pnpm --dir backend dev:telegram` из корня. `.dev.vars` игнорируется Git. Этот режим по-прежнему
требует корректного HTTPS callback для реального Telegram OIDC.

Перед коммитом выполните:

```bash
pnpm check
```

Gate последовательно проверяет сгенерированные Cloudflare types, формат,
архитектурные границы, TypeScript, тесты и dry-run сборки Wrangler.

## D1 и миграции

Schema находится в `src/platform/database/schema.ts`, а сгенерированный SQL — в
`migrations/`. Миграции не запускаются из Worker и не применяются CI автоматически.
Единый schema-файл — осознанное маленькое исключение уровня persistence
composition: он описывает таблицы и внешние ключи, но не содержит продуктовых
правил. Если schema станет конфликтной зоной, её фрагменты можно перенести в
модули, сохранив этот файл только build-time aggregator для Drizzle Kit.

Обычный цикл изменения schema:

```bash
pnpm db:generate
pnpm db:migrate:local
pnpm check
pnpm db:migrate:remote
pnpm deploy
```

Всегда просматривайте сгенерированный SQL перед применением. Для изменений,
которые несовместимы с работающей версией API, используйте отдельные
expand/migrate/contract шаги, а не одну разрушающую миграцию.

В `wrangler.jsonc` исходно записан all-zero `database_id`. Это предохранитель
шаблона: remote migration и production deploy не должны случайно обратиться к
базе автора стартера. Для нового проекта:

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create planner-db
```

Wrangler вернёт UUID. В конкретном проекте замените им обе all-zero записи
`database_id` (base и `env.production`) до любой remote-операции. UUID базы не
является секретом, но принадлежит
конкретному Cloudflare account. В прикладном репозитории его нормально
закоммитить; при копировании стартера всегда создавайте новую D1 и не
переиспользуйте чужой UUID.

## Telegram OIDC

Production использует современный Telegram OpenID Connect Authorization Code
Flow с PKCE. Legacy login widget в стартер не входит.

1. Создайте отдельного нового бота через официальный `@BotFather`.
2. В BotFather настройте Telegram Login/OIDC для production origin и получите
   Client ID и Client Secret.
3. Зарегистрируйте точный callback:
   `https://<ваш-workers.dev>/api/auth/telegram/callback`.
4. Укажите реальный HTTPS origin без path в `APP_ORIGIN`, а допустимый redirect
   того же origin — в `AUTH_SUCCESS_REDIRECT_URL`.
5. Сохраните значения через скрытый prompt Wrangler:

```bash
pnpm exec wrangler secret put TELEGRAM_OIDC_CLIENT_ID --env production
pnpm exec wrangler secret put TELEGRAM_OIDC_CLIENT_SECRET --env production
pnpm exec wrangler secret put AUTH_FLOW_SECRET --env production
```

`AUTH_FLOW_SECRET` — отдельный криптографически случайный секрет длиной 32 байта,
представленный в base64url. Генерируйте его локально криптографическим
генератором или password manager. Не передавайте bot token, Client Secret или
`AUTH_FLOW_SECRET` в чат, issue, документацию, shell arguments либо Git. Bot
token для OIDC не подходит и приложению не нужен.

OIDC ID token принимается только с фиксированным Telegram issuer, audience и
алгоритмом RS256; `state`, PKCE и `nonce` обязательны. Короткоживущий flow cookie
зашифрован AES-GCM и живёт 10 минут. Новый старт входа в том же браузере заменяет
предыдущий незавершённый flow. Сессия — непрозрачный случайный token; в D1
хранится только его hash.
BotFather должен быть настроен на RS256; другой алгоритм считается ошибкой
production-конфигурации. Ротация `AUTH_FLOW_SECRET` инвалидирует только
незавершённые входы, которым не более десяти минут.

Cloudflare invocation logs отключены: иначе стандартная строка события содержит
полный callback URL вместе с одноразовыми `code` и `state`. Собственные
структурированные логи используют только pathname и никогда не пишут query,
cookies или токены.

Production cookie `__Host-session` имеет `Secure`, `HttpOnly`, `SameSite=Lax`,
`Path=/`, не имеет `Domain` и живёт до 30 дней. Из этого следует важное
ограничение: браузерный frontend должен обращаться к API с того же origin. В
бесплатной схеме отдельный frontend на `*.pages.dev` и API на `*.workers.dev`
не образуют рабочую cookie-сессию. Если UI понадобится, отдавайте его с того же
Worker origin через Static Assets либо ставьте frontend и API за единым origin.

## Telegram Bot API webhook

Bot API — отдельная capability от Telegram OIDC. Она выключена по умолчанию:

```text
TELEGRAM_BOT_MODE=disabled | webhook
```

Режимы независимы и включаются только своими настройками:

| `AUTH_MODE` | `TELEGRAM_BOT_MODE` | Результат |
| --- | --- | --- |
| `development` | `disabled` | Локальная D1-сессия `local-developer`; OIDC и webhook отвечают безопасным `404` |
| `disabled` | `disabled` | OIDC/Notes и webhook отвечают безопасным `404` |
| `telegram` | `disabled` | Работают OIDC/Notes; webhook отвечает безопасным `404` |
| `disabled` | `webhook` | Работает Bot API webhook; OIDC/Notes отвечают безопасным `404` |
| `telegram` | `webhook` | OIDC/Notes и Bot API webhook работают независимо |

Это независимость runtime-конфигурации. Checked-in production preset самого
стартера по умолчанию включает `AUTH_MODE=telegram` и требует OIDC secrets через
Wrangler; для bot-only derived deployment явно поменяйте production vars и
соответствующий список required secrets перед deploy. Не добавляйте ненужные
secrets только ради capability, которая выключена.

В режиме `webhook` Worker читает `TELEGRAM_BOT_TOKEN` и
`TELEGRAM_BOT_WEBHOOK_SECRET` из Wrangler secrets. Второй секрет передаётся в
`setWebhook.secret_token` и проверяется в заголовке
`X-Telegram-Bot-Api-Secret-Token`. Не переиспользуйте для этого OIDC Client
Secret или `AUTH_FLOW_SECRET`.

Маршрут — только `POST /telegram/webhook`. Его безопасные ответы не раскрывают
токен, webhook secret, тело update, cookies или query-параметры:

| Условие | Ответ |
| --- | --- |
| Capability выключена или использован другой HTTP-метод | `404 NOT_FOUND` |
| Secret отсутствует или неверен | `401 UNAUTHENTICATED` |
| Content-Type не является JSON | `415 UNSUPPORTED_MEDIA_TYPE` |
| JSON не является объектом update | `400 VALIDATION_FAILED` |
| Update обработан, в том числе неизвестного для reference handler типа | `200` |
| Ошибка инициализации или обработчика | `500 INTERNAL_ERROR`; Telegram может повторить доставку |

Ошибочные HTTP-ответы имеют общий формат Problem Details. В логах ошибок webhook
остаются только категория события, pathname, request ID и безопасно разобранный
`update_id`; данные провайдера не логируются. Общий request log добавляет лишь
метод, статус и длительность запроса.

В Planner обработчики `/start`, `/help`, `/stop`, текстовых ответов и inline-кнопок
связаны с модулем `reminders`. Подключение личного чата начинается с одноразовой
ссылки из настроек сайта. Бизнес-операции вызываются через публичные контракты;
`bot.ts` сохраняет инициализацию, cache и безопасную границу ошибок.

Опция `createTelegramBotModule({ createWebhookHandler })` остаётся точкой подмены
транспорта в тестах. Детали поведения: [Telegram-напоминания](docs/telegram-reminders.md).

### At-least-once delivery and idempotency

Telegram может повторно доставить update при timeout или ответе с ошибкой, поэтому
webhook имеет семантику at-least-once: повторы и конкурентная доставка ожидаемы.
Команда записи выводит ключ `telegram:<update-id>` для единственного подключённого
бота и сохраняет квитанцию в `planning_entry_commands` в одной транзакции D1
с изменением значения. Повтор не применяет старое значение заново. Создание
вопроса и откладывание также имеют стабильные ключи событий.

Для исходящих вопросов есть журнал `reminder_jobs` и атомарный захват задания.
Сбой после принятия сообщения Telegram, но до фиксации результата, помечается
как `unknown`; автоматическая повторная отправка такого сообщения отключена.
Вечерний сбор снова проверит незаполненные цели. Отправки запускает один Cron;
Queues и Durable Objects не используются.

Для локальной проверки HTTP-границы без настоящего токена запустите Worker и
отправьте сохранённый fake update:

```bash
pnpm dev
./scripts/curl-telegram-update.sh
```

С локальной конфигурацией по умолчанию ожидается безопасный `404`; если
capability включена, запрос без webhook-заголовка завершается `401` до
инициализации Bot API. Этот сценарий не обращается к Telegram и не является
проверкой реального ответа бота. Fake Bot API и `/start` проверяются в Vitest:

```bash
pnpm exec vitest run test/telegram-bot.spec.ts test/telegram-bot-operator.spec.mjs
```

### Ручная регистрация и inspection

Изменение состояния webhook выполняется только отдельной operator-командой.
Секреты нельзя передавать аргументами (`--token`, `--secret` и т. п.) или
выводить; команда принимает их только из переменных окружения либо из stdin.
`info` и `clear` требуют только token, а `set` — две непустые строки (token,
затем webhook secret):

```bash
pnpm telegram:operator -- info
pnpm telegram:operator -- set https://<ваш-workers.dev>/telegram/webhook
pnpm telegram:operator -- clear
```

`set` требует точный HTTPS URL `https://<ваш-workers.dev>/telegram/webhook`
без query-параметров. Он передаёт Telegram обновления `message` и `callback_query` и
ставит `drop_pending_updates=false`. Для намеренного удаления накопленных
обновлений нужен явный флаг; команда выведет предупреждение:

```bash
pnpm telegram:operator -- set https://<ваш-workers.dev>/telegram/webhook --drop-pending-updates
```

Перед ручной операцией создайте независимые production secrets через скрытый
prompt Wrangler и включите `TELEGRAM_BOT_MODE=webhook` в production vars:

```bash
pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN --env production
pnpm exec wrangler secret put TELEGRAM_BOT_WEBHOOK_SECRET --env production
```

Токен бота берётся у `@BotFather`. Независимый webhook secret сгенерируйте в
password manager или криптографическом генераторе; он должен содержать от 1 до
256 символов только из `A-Z`, `a-z`, `0-9`, `_` и `-`. Секреты, сохранённые
через `wrangler secret put`, становятся доступными Worker, но не появляются
автоматически в environment локального operator-процесса.

Для локального operator-сеанса введите значения без отображения и удалите их
из environment после операции. В команды и shell history не попадают сами
секреты:

```bash
unset TELEGRAM_BOT_TOKEN TELEGRAM_BOT_WEBHOOK_SECRET
printf '%s' 'Telegram bot token (hidden): ' >&2
read -r -s TELEGRAM_BOT_TOKEN
printf '\n' >&2
printf '%s' 'Telegram webhook secret (hidden): ' >&2
read -r -s TELEGRAM_BOT_WEBHOOK_SECRET
printf '\n' >&2
export TELEGRAM_BOT_TOKEN TELEGRAM_BOT_WEBHOOK_SECRET

pnpm telegram:operator -- info
pnpm telegram:operator -- set https://<ваш-workers.dev>/telegram/webhook
pnpm telegram:operator -- clear

unset TELEGRAM_BOT_TOKEN TELEGRAM_BOT_WEBHOOK_SECRET
```

Также допустим non-echoing stdin pipeline из доверенного password manager или
другого secret source: для `info`/`clear` он передаёт одну строку token, для
`set` — две строки в порядке token, webhook secret. Не используйте `echo` или
`printf` для передачи самого секрета: источник должен писать значения напрямую
в stdin operator-команды, а не показывать их в выводе.

После явно разрешённого `set` выполните inspection — `info` вызывает только
`getWebhookInfo` и позволяет проверить URL, `pending_update_count`, список
обновлений и последнюю ошибку доставки. Для rollback вызовите `clear`, затем
снова `info`; `clear` использует `setWebhook` с пустым URL и по умолчанию также
не удаляет pending updates. Пока webhook установлен, Telegram не позволяет
использовать `getUpdates`; сначала удалите webhook, если требуется перейти на
polling. Установка, очистка и inspection не выполняются при старте Worker,
тестах, в CI или во время deploy.

## Ручной production deploy

Публикация запускается из корня workspace: `pnpm deploy` сначала собирает SPA,
затем публикует единый Worker `app`. Перед публикацией — корневой `pnpm check`
и `pnpm deploy:dry-run`. Remote миграции и webhook не запускаются автоматически.
Первый переход с двух Worker требует переноса secrets и переключения Cron/webhook;
см. [инструкцию миграции](../docs/monolith-migration.md).

## Контракт нулевой обязательной стоимости

Стартер использует только Workers Free и D1 Free и не создаёт платные ресурсы.
Это не обещание безлимитной работы: проект остаётся бесплатным, пока account на
Free plan, а фактическое потребление укладывается в актуальные
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/) и
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

При исчерпании free quota запросы могут отклоняться, ограничиваться или ждать
сброса соответствующего лимита; стартер не включает автоматический переход на
платный ресурс. Перед каждым production-проектом проверьте текущие лимиты и
поведение в официальной документации Cloudflare. Подключение Paid plan,
платного add-on или нового Cloudflare resource требует отдельного решения.
Распределённого rate limiter в v1 нет: isolate-local счётчик создавал бы ложное
ощущение защиты. Для публичного высокорискового API это отдельная availability и
abuse-задача, которую следует решить до привлечения реального трафика.

## Что именно доказывают проверки

- `pnpm check` доказывает только локальные static checks, тесты в локальном
  Workers/D1 runtime и успешную dry-run сборку.
- Зелёный локальный gate не доказывает, что GitHub Actions запускался или прошёл.
- Push в GitHub не доказывает зелёный CI: статус workflow нужно увидеть отдельно.
- `pnpm db:migrate:remote` доказывает применение миграций к выбранной remote D1,
  но не доступность Worker.
- Успешный deploy и `200` от `/health` доказывают доступность опубликованного
  Worker, но не Telegram login и не CRUD.
- `scripts/curl-telegram-update.sh` доказывает только безопасную HTTP-границу
  без настоящего токена; fake Bot API в тестах не заменяет Telegram.
- `telegram:operator info` — отдельная remote inspection; `set` и `clear` —
  явные remote mutations и не запускаются автоматически.
- Fake OIDC в тестах не заменяет реальный OIDC/Notes smoke.
- `/health`, fake update, fake Bot API и `telegram:operator info` сами по себе не
  доказывают реальный Bot API smoke.

### OIDC/Notes smoke

OIDC/Notes smoke выполняется в обычном браузере с выделенным тестовым ботом:
старт входа → согласие Telegram → callback → `/api/auth/me` →
create/list/get/update/delete своей заметки → logout → отказ старой сессии.
Только такой сценарий подтверждает совместную работу BotFather-настроек OIDC,
cookies, Worker и D1. Он не доказывает реальную доставку Bot API webhook.

### Bot API smoke (TB-06, отдельное разрешение)

Реальный Bot API smoke требует отдельного разрешения TB-06, выделенного test bot,
настроенных secrets и явно выбранной hosted deployment revision. Наблюдаемый
сквозной путь: пользователь отправляет `/start` в Telegram → Telegram доставляет
`POST /telegram/webhook` на опубликованный Worker → handler обрабатывает update →
Worker вызывает Bot API → пользователь получает ответ бота. `setWebhook`, deploy,
inspection и запись evidence выполняются отдельными операциями; они не являются
частью `pnpm check` и не запускаются автоматически.

## Лицензия

Проект помечен как `UNLICENSED`; публичная лицензия намеренно не добавлена.

## Личный плагин ChatGPT

`GET /api/integrations/chatgpt` читает статус подключения без ключа;
`POST` с `{}` создаёт новый ключ, заменяя предыдущий, а `DELETE` отзывает его.
Эти маршруты доступны только веб-сессии и сохраняют проверку Origin.
Ключ действует год; хранится только SHA-256 в `chatgpt_connections` (миграция
`0005`). Он принимается как `Authorization: Bearer ...` на `/api/auth/me`,
маршрутах целей, планов, поиска и напоминаний. Он не разрешает управление ключами,
входом или заметками. Cookie-сессия и Telegram OIDC не меняют свой контракт.

`POST /api/goals/{goalId}/entries/{date}/adjust` принимает
`{ "delta": 200, "operationId": "UUID" }` и прибавляет к количеству.
Команда и запись коммитятся одной D1 batch; повтор с тем же ID не прибавляет
дважды. Сравнение revision предотвращает перезапись параллельного изменения:
в этом случае `409 ENTRY_CONFLICT`, нужно перечитать план перед новой операцией.
Заметка сохраняется; дата и тип проверяются правилами Planning.
Миграция `0006` связывает подтверждения прибавлений с целью: они не очищаются
через 90 дней и удаляются каскадно при удалении цели из D1.

Ни новая база, ни Worker, ни Cron не добавляются. [Плагин и порядок
переключения](../chatgpt/README.md).
