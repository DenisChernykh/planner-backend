# Developer card and author dialog QA — 2026-10-23

final result: passed

## Scope and evidence

- Source of truth: `frontend/docs/design/Planner.pen`, inspected through Pen MCP.
  Frames/components: `uzjj6`, `v5n5Rv`, `LGWTc`, `TuUlm`, `g7cFi`.
- Implementation: `frontend/src/widgets/planner-shell/ui/developer-card.tsx`.
- Local route: `http://127.0.0.1:5173/plans/2026-09`, using a temporary read-only
  local API fixture with a sample user and empty plan. Production data was not used.
- Browser: Codex in-app browser, desktop 1440 × 1024 and mobile 390 × 844 /
  320 × 844 CSS px. Captures use one image pixel per CSS pixel.
- Evidence directory (local, outside the repository):
  `/Users/denischernykh/.codex/visualizations/2026/10/23/01a1675b-7c6b-7f02-bccf-830644f68fe1/monetization/`.
- Source images: `uzjj6.png` (1440 × 1024), `LGWTc.png` (561 × 665,
  including the export's edge rounding), `TuUlm.png` (390 × 844),
  `g7cFi.png` (320 × 844). Card reference was cropped from `uzjj6.png` so
  that it retains the screen's theme bindings.
- Implementation images: `implementation-desktop-final.png` (1440 × 1024),
  `implementation-dialog-final.png` (560 × 662),
  `implementation-card-final.png` (144 × 206),
  `implementation-mobile-390-final.png` (390 × 844),
  `implementation-mobile-320-final.png` (320 × 844).
- Combined comparisons opened together: `comparison-dialog.png`,
  `comparison-card.png`, `comparison-390.png`, `comparison-320.png`.
  Mobile full views show the entire author sheet. Desktop comparison focuses on
  the dialog and card because the surrounding application's existing shell and
  empty-plan fixture differ from the design's populated September plan.

## Comparison history and findings

1. Initial browser pass found two P2 issues: the narrow desktop card wrapped its
   heading/action beyond the source layout, and the nested mobile dialog did not
   shade the navigation because Base UI omits nested backdrops by default.
2. Fixed the card's available width to 144 px, tightened its heading/action
   tracking and kept the action on one line with a 12 px chevron. Forced the
   dialog backdrop to render when nested. Matched the AI block's 14 px padding
   and the dialog's 16 px corner radius.
3. Final combined comparisons confirm the two-line desktop heading, single-line
   action, shaded navigation and complete mobile content. No actionable P0/P1/P2
   differences remain. Desktop dialog height is approximately 663 px versus
   664 px in the design; mobile sheet top edges differ by approximately 4 px.

## Required fidelity surfaces

- Fonts/typography: existing Inter Variable; source text, font sizes, weights,
  line heights and hierarchy retained. Desktop card uses slightly tighter
  tracking to fit the source layout with browser font metrics. Minor rasterizer
  differences between Pen's Inter and browser Inter Variable are acceptable.
- Spacing/layout rhythm: 144 px desktop card, 560 px desktop dialog, 28 px
  desktop padding, 20 px mobile horizontal padding, 20 px section gaps. Content
  fits without scrolling at 390 × 844 and 320 × 844. The mobile close target
  is 44 × 44 px. Shorter viewports have a bounded scroll container and safe-area
  bottom padding.
- Colors/tokens: existing semantic primary, primary-soft, muted, foreground,
  card and border tokens; no new palette. The AI description uses foreground
  text on primary-soft as specified. Existing application token rendering is
  preserved rather than hardcoding exported pixel colors.
- Image quality/assets: no raster assets are needed. Existing Lucide library
  supplies the source icons; no recreated illustrations or screenshot UI.
- Copy/content: author introduction, all four services, example-work paragraph,
  Telegram action and contact match the design. Donation UI is intentionally
  omitted from this implementation scope.

## Interaction and verification checklist

- Desktop trigger opens the modal; keyboard focus moves inside it.
- Tab and Shift+Tab cycle between the close button and Telegram link.
- Escape and close button return focus to the card's trigger.
- Mobile backdrop click closes only the author dialog and returns focus to the
  trigger in the still-open navigation. Mobile Escape behavior is also covered
  by an automated regression test.
- Entire contact button is an external HTTPS link with `noopener noreferrer`.
  No Telegram message was sent.
- Clean browser load and author-dialog interaction produced no console errors
  or warnings. Earlier Vite HMR warnings during API regeneration disappeared
  after the completed checks and fresh-page verification.
- `pnpm check` passed (frontend, backend, ChatGPT package and monolith smoke).
- `pnpm boundaries:check` passed; existing architecture warnings remain.
- No dependencies, backend/API behavior or deployment configuration changed.

## Follow-up polish and limits

Existing mobile navigation remains a side sheet, while the mock depicts a
full-width menu. This surrounding shell is outside the requested card/dialog
change. Device safe-area behavior is implemented in CSS but was not tested on
physical iOS hardware. No production deployment was performed.

---

# Визуальная приёмка прогресса и Telegram-отчётов

Дата: 9 октября 2026 года. Проверенная ревизия реализации: `6c4d95b`.
final result: passed

Принята локальная реализация в пределах, описанных ниже.
Публикация, реальный Telegram и операции настоящего плагина выполнены после разрешения.
Встроенный октябрьский план проверен; [открытого остатка по ТЗ нет](docs/progress-design-audit-2026-10-08/remaining.md);
точные уровни наблюдения — в [журнале выпуска](docs/progress-design-audit-2026-10-08/release.md).

## Источник и способ сверки

Визуальный источник — редактируемый [Planner.pen](frontend/docs/design/Planner.pen)
в pen.dev. Через Pen MCP повторно прочитаны все 54 кадра
[каталога](frontend/docs/design/progress/frames.json) и компоненты `kynaE`:
55 полных деревьев слоёв и 51 переменная. Итоговый read-only снимок наблюдений
получен `2026-10-09T05:56:47.063Z`. Канонические хеши всех 55 деревьев совпадают
с предыдущим чтением; прежние наблюдения границ имеют отдельную дату.
Тексты, шрифты, размеры и переменные сохранены в
[pen-inspection.json](docs/progress-design-audit-2026-10-08/evidence/pen-inspection.json).
Зашифрованный файл `.pen` не разбирался напрямую и не изменялся.

Проверка охватывает 53 продуктовых кадра и таблицы состояний; карта `RHvwO`
описывает переходы и не требует отдельной страницы приложения. Таблицы `iXnee`,
`DQbgA`, `cRrRV`, `SfULy`, `uhwCG`, `kSgo4` сопоставлены с отдельными состояниями
работающих компонентов. Кадр №27 — примеры сравнения и границ на обычных экранах,
а названия целей в нём не задают ветвление программы.

Источник и соответствующий интерфейс рассматривались рядом в одном изображении:
53 общих сравнения и 17 увеличенных сравнений важных деталей. Временные
снимки исходного Pen, полученные при первоначальном MCP-просмотре, использованы
после подтверждения неизменности полных деревьев. Новые PNG макетов не создавались
и в репозиторий не добавлялись. Сравнения находятся только во временной папке
`/private/tmp/planner-progress-final-review-20261009`; это не новый источник дизайна.

Сохранены [94 снимка работающего приложения](docs/progress-design-audit-2026-10-08/coverage.md)
и [точные условия каждого](docs/progress-design-audit-2026-10-08/evidence/design-captures.json).
Рендер: Chromium, deviceScaleFactor=1, ширины 1440, 390 и 320 CSS px; высота
viewport соответствует записи evidence. Длинные страницы сняты целиком;
диалоги — в viewport, предпросмотр сообщения — с раскрытым прокручиваемым
содержимым только для захвата. Это раскрытие не меняет продуктовый компонент.
API полностью перехвачен на loopback; данные и часы вымышленные.
Все 94 захвата прошли проверку отсутствия горизонтального переполнения,
pageErrors и unhandled requests.

## Что именно сравнивалось

| Группа | Кадры и работающие состояния | Результат |
| --- | --- | --- |
| Обзор и детали | Неделя, месяц, количество, сравнение, отметка, шкала, время; desktop/mobile и обзор 320 px | Порядок блоков, различие выполнений и заполненности, графики и навигация проверены. |
| Пустые состояния | Загрузка, ошибка, нет целей, нет записей, период до старта, будущий старт, недоступная цель, пустой фильтр — 16 рендеров | Отдельные иконки, пояснения и действия; отсутствие записей не выдаётся за нулевую статистику. |
| Общая дата | Desktop/mobile/320, null, future, invalid, pending, error, success | Календарь, действия, доступность и сохранение проверены также браузерными сценариями. |
| Напоминания и отчёты | Две независимые карточки, desktop/mobile/320, все состояния формы, поиск и массовый выбор | Переключатели, прогноз, отключение, ошибки и предпросмотр проверены. |
| Правила и границы | Отмена/предупреждение/error/pending; ноль, ≤, =, полночь, время без условия, месячный план, отдельные недели; сравнение месяцев, разные правила, соседний план, серии | Каждый вариант отрендерен и сверён с соответствующей панелью Pen. |
| Сообщения | Среда, воскресенье, нет записей, длинный отчёт, перенос тихими часами, смешанные типы | Проверено содержимое браузерного preview. Реальное сообщение среды и обе кнопки подтверждены владельцем — [E02](docs/progress-design-audit-2026-10-08/checks.md#e02). Остальные перечисленные визуальные варианты проверены локально. |

У таблиц состояний панель Pen может иметь ширину 350, 604 или 916 px,
а работающий компонент проверяется внутри страницы 390 или 1440 px.
Такие сравнения проверяют состояние и композицию компонента, а не равенство
пикселей целой страницы. В общих снимках представлены исходные размеры обеих сторон.

Основные фикстуры обзора и месячного сравнения повторяют показатели Pen;
пример декабря даёт `18/21` против `15/21`, `520` против `430`, изменение `+14 п. п.`.
Дополнительные варианты намеренно проверяют другие факты: например, время
`12:00` рядом с `23:50` и `00:10`, месячный план `2/17`, длинный отчёт из 30 целей.
Соответствие конкретных чисел этим фикстурам проверено расчётными и интеграционными
сценариями. Эти рендеры не заявляются точными копиями исходного набора примеров.

## Пять проверенных поверхностей

| Поверхность | Что проверено и где |
| --- | --- |
| Шрифты | Pen использует Inter; приложение загружает Inter Variable из существующего пакета. Проверены иерархия заголовков 32/26 px, главных чисел, подписей, осей, ошибок и переносы на 320/390 px. |
| Отступы и размеры | Проверены desktop-строки и мобильные карточки, три показателя, календарная сетка, формы и диалоги. Пояснения уменьшенного/неподготовленного плана вынесены из узкой карточки числа; сетка мест оставлена недельному плану. Длинные страницы прокручиваются. |
| Цвета | Цвета привязаны к существующим семантическим токенам [index.css](frontend/src/app/styles/index.css), сопоставленным с переменными Pen: primary/primary-soft, muted, success/success-soft, destructive. Запись, выполнение, отсутствие, excluded и future различимы также текстом и значками. |
| Иконки и графика | Используются существующие Lucide-компоненты и SVG графиков. Иконка цели определяется tracking, а не названием «Чтение»/«Сон»/«Тренировки». Количество и шкала показаны столбцами, время — отдельными точками; круглые часы развёрнуты по самому большому разрыву. Растровые иллюстрации не добавлены. |
| Текст | Проверены общий старт, сохранение ранних фактов, неполный/будущий период, сегодняшние значения, сопоставимые диапазоны, разные правила, серии, перенос тихими часами и delivery states. Числа/единицы/названия динамические; наблюдение без критерия подписано как записанное значение. |

## Исправления и повторная проверка

Первичная сверка выявила упрощённые состояния и элементы, хотя расчётные тесты
ранее проходили. Исправлены композиция пустых экранов, нулевая сводка при отсутствии
записей, признаки записанных наблюдений, кнопки и календарь даты, мобильные действия,
полные показатели сравнения, недельная история и остаток, форма отчётов и её состояния.
Промежуточные рендеры сохранены в
[iterations/pass-1](docs/progress-design-audit-2026-10-08/evidence/iterations/pass-1).

При увеличенной сверке оставались P1: пояснение о соседнем месяце сжималось в
узкой карточке показателя, а месячный план получал длинную сетку мест вместо
компактного результата. Они исправлены в `6c4d95b`; пояснения теперь отдельными
блоками, месячный план — числом и полосой. У времени убраны соединительные линии
(P2): Pen показывает независимые записи. После исправления повторно сняты все
94 состояния и просмотрены соответствующие общие и увеличенные сравнения.

Отдельно исправлены ошибки самой фикстуры/захвата: прогноз карточки напоминаний
получает нужное состояние API; диалог снимается внутри viewport; длинный preview
снимается вместе с последними блоками и сообщением о скрытых целях. Эти исправления
не выдаются за исправления поведения приложения.

Финальные рендеры последних исправлений:

- [Неподготовленный соседний план](docs/progress-design-audit-2026-10-08/evidence/final/boundary-missing-neighbor.png).
- [Уменьшенный месячный план](docs/progress-design-audit-2026-10-08/evidence/final/variant-monthly-plan.png).
- [Время через полночь](docs/progress-design-audit-2026-10-08/evidence/final/variant-time-midnight.png).
- [Полный длинный предпросмотр](docs/progress-design-audit-2026-10-08/evidence/final/telegram-truncated.png).

## Различия и предел результата

Сохранена существующая оболочка Planner: навигация и интеграционные элементы
не переделывались под отдельный набор кадров прогресса. Названные иконки примеров
заменены общими иконками типов согласно требованию не привязываться к целям.
В интерфейсе присутствуют явно заданные ТЗ элементы, сокращённые или отсутствующие
в отдельных кадрах: мини-графики §5.5, заполненность, пары прошлого периода,
серии, общая навигация периода, отмена и очистка поиска. Они увеличивают высоту
страниц и объясняют часть различий композиции. Это выполнение ТЗ и интеграция
в приложение; согласование новой редакции Pen с владельцем не заявляется.

Незначительные визуальные различия P3: текстовое поле даты использует civil ISO
`YYYY-MM-DD` рядом с русским календарём, а время редактируется существующим
системным полем. Статичный рисунок поля Pen не воспроизводит поведение браузерного
контрола. Размеры всего документа и переносы динамических названий не обязаны
совпадать с фиксированным иллюстративным набором данных.

Открытых P0/P1/P2 в проверенных локальных состояниях не осталось. Итог не означает
пиксельного равенства всех страниц, не проверяет реальный Telegram-клиент,
производственные данные или запуск опубликованной ревизии. Эти границы сохранены
в матрице, а не закрыты визуальным результатом.

Финальные функциональные доказательства: root `pnpm check`,
`pnpm boundaries:check`, 39 расчётных примеров и 28 браузерных сценариев.
Точное покрытие доступно в [каталоге проверок](docs/progress-design-audit-2026-10-08/checks.md).
