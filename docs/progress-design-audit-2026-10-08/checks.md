# Исходники и доказательства приёмки

Все C/T/P/B относятся к ревизии `2e5598d` (код приложения), локальной D1 и вымышленным данным.
Имена тестов ниже приведены точно. Новые диагностики P/B намеренно сохраняют `fail`;
они вынесены из CI, потому что фиксируют текущие нарушения приёмки, а не исправляют приложение.
Успешный `pnpm check` и эти проваленные сценарии могут существовать одновременно.

## Код

В матрице рядом с C указаны конкретная функция/поле/ветка. Здесь — файл и начало
основного экспортированного компонента/сценария, а не утверждение, что весь файл проверен одним тестом.

| ID | Исходник |
| --- | --- |
| <a id="c01"></a>C01 | [backend/src/modules/progress/domain/calculate.ts](../../backend/src/modules/progress/domain/calculate.ts#L19) |
| <a id="c02"></a>C02 | [backend/src/modules/progress/domain/calendar.ts](../../backend/src/modules/progress/domain/calendar.ts#L4) |
| <a id="c03"></a>C03 | [backend/src/modules/progress/application/progress.ts](../../backend/src/modules/progress/application/progress.ts#L25) |
| <a id="c04"></a>C04 | [backend/src/modules/progress/infrastructure/d1-progress-repository.ts](../../backend/src/modules/progress/infrastructure/d1-progress-repository.ts#L3) |
| <a id="c05"></a>C05 | [backend/src/modules/progress/presentation/http.ts](../../backend/src/modules/progress/presentation/http.ts#L37) |
| <a id="c06"></a>C06 | [backend/src/modules/planning/domain/rules.ts](../../backend/src/modules/planning/domain/rules.ts#L28) |
| <a id="c07"></a>C07 | [backend/src/modules/planning/infrastructure/d1-planning-repository.ts](../../backend/src/modules/planning/infrastructure/d1-planning-repository.ts#L102) |
| <a id="c08"></a>C08 | [backend/src/modules/reminders/application/reports/progress-reports.ts](../../backend/src/modules/reminders/application/reports/progress-reports.ts#L37) |
| <a id="c09"></a>C09 | [backend/src/modules/reminders/application/reports/report-message.ts](../../backend/src/modules/reminders/application/reports/report-message.ts#L55) |
| <a id="c10"></a>C10 | [backend/src/modules/reminders/infrastructure/d1-progress-report-repository.ts](../../backend/src/modules/reminders/infrastructure/d1-progress-report-repository.ts#L23) |
| <a id="c11"></a>C11 | [backend/src/modules/reminders/domain/progress-reports.ts](../../backend/src/modules/reminders/domain/progress-reports.ts#L21) |
| <a id="c12"></a>C12 | [backend/src/modules/reminders/domain/schedule.ts](../../backend/src/modules/reminders/domain/schedule.ts#L10) |
| <a id="c13"></a>C13 | [backend/src/modules/reminders/application/scheduling/run-reminders.use-case.ts](../../backend/src/modules/reminders/application/scheduling/run-reminders.use-case.ts#L9) |
| <a id="c14"></a>C14 | [backend/src/modules/reminders/application/scheduling/prepare-current-plan.use-case.ts](../../backend/src/modules/reminders/application/scheduling/prepare-current-plan.use-case.ts#L6) |
| <a id="c15"></a>C15 | [backend/src/modules/reminders/presentation/progress-reports-http.ts](../../backend/src/modules/reminders/presentation/progress-reports-http.ts#L87) |
| <a id="c16"></a>C16 | [frontend/src/widgets/progress/ui/progress-view.tsx](../../frontend/src/widgets/progress/ui/progress-view.tsx#L60) |
| <a id="c17"></a>C17 | [frontend/src/widgets/progress/ui/progress-calendar.tsx](../../frontend/src/widgets/progress/ui/progress-calendar.tsx#L6) |
| <a id="c18"></a>C18 | [frontend/src/widgets/progress/ui/goal-detail.tsx](../../frontend/src/widgets/progress/ui/goal-detail.tsx#L11) |
| <a id="c19"></a>C19 | [frontend/src/widgets/progress/ui/goal-chart.tsx](../../frontend/src/widgets/progress/ui/goal-chart.tsx#L9) |
| <a id="c20"></a>C20 | [frontend/src/widgets/progress/ui/progress-meter.tsx](../../frontend/src/widgets/progress/ui/progress-meter.tsx#L5) |
| <a id="c21"></a>C21 | [frontend/src/widgets/progress/ui/goal-filter.tsx](../../frontend/src/widgets/progress/ui/goal-filter.tsx#L7) |
| <a id="c22"></a>C22 | [frontend/src/widgets/progress/ui/goal-rule-editor.tsx](../../frontend/src/widgets/progress/ui/goal-rule-editor.tsx#L7) |
| <a id="c23"></a>C23 | [frontend/src/features/progress-settings/ui/progress-start-date.tsx](../../frontend/src/features/progress-settings/ui/progress-start-date.tsx#L9) |
| <a id="c24"></a>C24 | [frontend/src/features/reminders/ui/progress-report-settings.tsx](../../frontend/src/features/reminders/ui/progress-report-settings.tsx#L18) |
| <a id="c25"></a>C25 | [frontend/src/features/reminders/ui/reminder-settings.tsx](../../frontend/src/features/reminders/ui/reminder-settings.tsx#L12) |
| <a id="c26"></a>C26 | [frontend/src/widgets/planner-overview/ui/plan-grid.tsx](../../frontend/src/widgets/planner-overview/ui/plan-grid.tsx#L42) |
| <a id="c27"></a>C27 | [frontend/src/widgets/planner-overview/ui/plan-tempo.tsx](../../frontend/src/widgets/planner-overview/ui/plan-tempo.tsx#L4) |
| <a id="c28"></a>C28 | [backend/migrations/0007_lean_stardust.sql](../../backend/migrations/0007_lean_stardust.sql#L1) |
| <a id="c29"></a>C29 | [backend/src/app/create-app.ts](../../backend/src/app/create-app.ts#L55) |
| <a id="c30"></a>C30 | [backend/wrangler.jsonc](../../backend/wrangler.jsonc#L1) |
| <a id="c31"></a>C31 | [frontend/src/app/styles/index.css](../../frontend/src/app/styles/index.css#L1) |
| <a id="c32"></a>C32 | [frontend/src/app/router/routes.tsx](../../frontend/src/app/router/routes.tsx#L1) |
| <a id="c33"></a>C33 | [frontend/src/widgets/planner-shell/ui/planner-sidebar.tsx](../../frontend/src/widgets/planner-shell/ui/planner-sidebar.tsx#L58) |
| <a id="c34"></a>C34 | [frontend/src/widgets/planner-overview/ui/plan-header.tsx](../../frontend/src/widgets/planner-overview/ui/plan-header.tsx#L7) |
| <a id="c35"></a>C35 | [backend/src/modules/planning/application/plans/ensure-current-plan.use-case.ts](../../backend/src/modules/planning/application/plans/ensure-current-plan.use-case.ts#L5) |
| <a id="c36"></a>C36 | [frontend/src/features/reminders/ui/general-settings.tsx](../../frontend/src/features/reminders/ui/general-settings.tsx#L11) |
| <a id="c37"></a>C37 | [backend/src/modules/reminders/infrastructure/d1-reminder-repository.ts](../../backend/src/modules/reminders/infrastructure/d1-reminder-repository.ts#L53) |
| <a id="c38"></a>C38 | [backend/src/modules/telegram-bot/infrastructure/reminder-transport.ts](../../backend/src/modules/telegram-bot/infrastructure/reminder-transport.ts#L16) |
| <a id="c39"></a>C39 | [backend/src/modules/reminders/domain/jobs.ts](../../backend/src/modules/reminders/domain/jobs.ts#L7) |
| <a id="c40"></a>C40 | [backend/src/modules/progress/public-contracts.ts](../../backend/src/modules/progress/public-contracts.ts#L1) |
| <a id="c41"></a>C41 | [backend/src/index.ts](../../backend/src/index.ts#L1) |
| <a id="c42"></a>C42 | [backend/src/modules/reminders/application/answers/handle-reminder-reply.use-case.ts](../../backend/src/modules/reminders/application/answers/handle-reminder-reply.use-case.ts#L11) |
| <a id="c43"></a>C43 | [.github/workflows/check.yml](../../.github/workflows/check.yml#L1) |

## Существующие тесты: 102 прошли, 0 провалены

[Полный результат без локальных абсолютных путей](evidence/acceptance-tests.json). D1 работает локально; транспорт и OIDC в тестах подменены.

| ID | Точное имя | Исходник | Результат |
| --- | --- | --- | --- |
| <a id="t01"></a>T01 | progress calculations includes the start date and excludes earlier entries without converting missing values to zero | [progress.spec.ts:53](../../backend/test/progress.spec.ts#L53) | passed |
| <a id="t02"></a>T02 | progress calculations distinguishes 4 successes, a recorded failure and one missing day | [progress.spec.ts:76](../../backend/test/progress.spec.ts#L76) | passed |
| <a id="t03"></a>T03 | progress calculations keeps a zero in the numeric average and supports atMost and equality rules | [progress.spec.ts:104](../../backend/test/progress.spec.ts#L104) | passed |
| <a id="t04"></a>T04 | progress calculations counts scales and unbounded time as observations, without adding successful completions | [progress.spec.ts:113](../../backend/test/progress.spec.ts#L113) | passed |
| <a id="t05"></a>T05 | progress calculations uses planning's time rule for an interval across midnight | [progress.spec.ts:128](../../backend/test/progress.spec.ts#L128) | passed |
| <a id="t06"></a>T06 | progress calculations reduces a monthly plan once, while retaining the original target | [progress.spec.ts:139](../../backend/test/progress.spec.ts#L139) | passed |
| <a id="t07"></a>T07 | progress calculations retains a weekly plan in midweek and reports overflow without losing the numerator | [progress.spec.ts:150](../../backend/test/progress.spec.ts#L150) | passed |
| <a id="t08"></a>T08 | progress calculations has no percentage or zero statistics for a future start and a period before the start | [progress.spec.ts:172](../../backend/test/progress.spec.ts#L172) | passed |
| <a id="t09"></a>T09 | progress calculations restores earlier history when the start is cleared | [progress.spec.ts:183](../../backend/test/progress.spec.ts#L183) | passed |
| <a id="t10"></a>T10 | progress calculations distinguishes an explicitly unselected future version from an unprepared month | [progress.spec.ts:189](../../backend/test/progress.spec.ts#L189) | passed |
| <a id="t11"></a>T11 | progress calculations merges compatible carried versions across months and rounds once | [progress.spec.ts:214](../../backend/test/progress.spec.ts#L214) | passed |
| <a id="t12"></a>T12 | progress calculations does not invent a reduced plan when the future adjacent month is missing | [progress.spec.ts:249](../../backend/test/progress.spec.ts#L249) | passed |
| <a id="t13"></a>T13 | progress calculations compares the same elapsed weekdays and suppresses a shorter previous month | [progress.spec.ts:261](../../backend/test/progress.spec.ts#L261) | passed |
| <a id="t14"></a>T14 | progress calculations ends a confirmed streak on an empty past day, allowing today's unrecorded day | [progress.spec.ts:291](../../backend/test/progress.spec.ts#L291) | passed |
| <a id="t15"></a>T15 | progress D1 and API defaults to all history, rejects nonexistent dates and preserves the previous setting | [progress.spec.ts:317](../../backend/test/progress.spec.ts#L317) | passed |
| <a id="t16"></a>T16 | progress D1 and API recalculates stored criteria atomically while preserving values and notes | [progress.spec.ts:325](../../backend/test/progress.spec.ts#L325) | passed |
| <a id="t17"></a>T17 | progress D1 and API does not disclose another owner's goal or create an unprepared future month | [progress.spec.ts:358](../../backend/test/progress.spec.ts#L358) | passed |
| <a id="t18"></a>T18 | progress D1 and API keeps a concurrent fact and threshold edit consistent without losing its note | [progress.spec.ts:391](../../backend/test/progress.spec.ts#L391) | passed |
| <a id="t19"></a>T19 | progress D1 and API uses authenticated owner and trusted Origin for settings and validates the OpenAPI query | [progress.spec.ts:422](../../backend/test/progress.spec.ts#L422) | passed |
| <a id="t20"></a>T20 | report schedules uses the first valid minute after a spring gap and one occurrence during fall back | [progress-reports.spec.ts:79](../../backend/test/progress-reports.spec.ts#L79) | passed |
| <a id="t21"></a>T21 | report schedules schedules strictly after saving, without replaying past slots | [progress-reports.spec.ts:87](../../backend/test/progress-reports.spec.ts#L87) | passed |
| <a id="t22"></a>T22 | progress reports with D1 and fake transport sends one report with reminders disabled and handles parallel Cron ticks | [progress-reports.spec.ts:96](../../backend/test/progress-reports.spec.ts#L96) | passed |
| <a id="t23"></a>T23 | progress reports with D1 and fake transport does not resend a delivered slot after editing its time | [progress-reports.spec.ts:112](../../backend/test/progress-reports.spec.ts#L112) | passed |
| <a id="t24"></a>T24 | progress reports with D1 and fake transport retains a snapshot during a confirmed retry, even if facts change | [progress-reports.spec.ts:120](../../backend/test/progress-reports.spec.ts#L120) | passed |
| <a id="t25"></a>T25 | progress reports with D1 and fake transport rebuilds an unsent snapshot when the shared start date changes | [progress-reports.spec.ts:143](../../backend/test/progress-reports.spec.ts#L143) | passed |
| <a id="t26"></a>T26 | progress reports with D1 and fake transport does not retry an unknown delivery result | [progress-reports.spec.ts:152](../../backend/test/progress-reports.spec.ts#L152) | passed |
| <a id="t27"></a>T27 | progress reports with D1 and fake transport skips slots older than 24 hours | [progress-reports.spec.ts:160](../../backend/test/progress-reports.spec.ts#L160) | passed |
| <a id="t28"></a>T28 | progress reports with D1 and fake transport retains Sunday's original period when quiet hours delay delivery until Monday | [progress-reports.spec.ts:166](../../backend/test/progress-reports.spec.ts#L166) | passed |
| <a id="t29"></a>T29 | progress reports with D1 and fake transport rejects a stale claim if selection changes after snapshot formation | [progress-reports.spec.ts:195](../../backend/test/progress-reports.spec.ts#L195) | passed |
| <a id="t30"></a>T30 | progress reports with D1 and fake transport rebuilds a pending snapshot when a selected goal is deleted | [progress-reports.spec.ts:222](../../backend/test/progress-reports.spec.ts#L222) | passed |
| <a id="t31"></a>T31 | progress reports with D1 and fake transport fits long reports into one message by omitting only whole goal blocks | [progress-reports.spec.ts:231](../../backend/test/progress-reports.spec.ts#L231) | passed |
| <a id="t32"></a>T32 | progress reports with D1 and fake transport saves disabled drafts without Telegram and rejects enabling or an empty enabled selection | [progress-reports.spec.ts:258](../../backend/test/progress-reports.spec.ts#L258) | passed |
| <a id="t33"></a>T33 | progress reports with D1 and fake transport pauses on deleted selected goals, restores their selection and never sends before a future start | [progress-reports.spec.ts:264](../../backend/test/progress-reports.spec.ts#L264) | passed |
| <a id="t34"></a>T34 | progress reports with D1 and fake transport keeps preview read-only and applies only selected goals | [progress-reports.spec.ts:279](../../backend/test/progress-reports.spec.ts#L279) | passed |
| <a id="t35"></a>T35 | progress reports with D1 and fake transport inherits report selection on rollover, including explicit exclusions | [progress-reports.spec.ts:311](../../backend/test/progress-reports.spec.ts#L311) | passed |
| <a id="t36"></a>T36 | progress screen switches calendar periods through API parameters and exposes fact editing links | [progress-view.test.tsx:119](../../frontend/src/widgets/progress/ui/progress-view.test.tsx#L119) | passed |
| <a id="t37"></a>T37 | progress screen explains future start without showing zero percentages or statistics | [progress-view.test.tsx:142](../../frontend/src/widgets/progress/ui/progress-view.test.tsx#L142) | passed |
| <a id="t38"></a>T38 | progress screen retries an error without leaving a loading skeleton | [progress-view.test.tsx:149](../../frontend/src/widgets/progress/ui/progress-view.test.tsx#L149) | passed |
| <a id="t39"></a>T39 | progress screen applies a view filter only after confirmation and discards cancelled selection | [progress-view.test.tsx:157](../../frontend/src/widgets/progress/ui/progress-view.test.tsx#L157) | passed |
| <a id="t40"></a>T40 | shared progress start date keeps the draft on failure, retries explicitly and closes only after saving | [progress-start-date.test.tsx:23](../../frontend/src/features/progress-settings/ui/progress-start-date.test.tsx#L23) | passed |
| <a id="t41"></a>T41 | shared progress start date cancels without writing and saves clearing as null | [progress-start-date.test.tsx:41](../../frontend/src/features/progress-settings/ui/progress-start-date.test.tsx#L41) | passed |
| <a id="t42"></a>T42 | progress report settings requires a selected goal for enabling and preserves explicit exclusions when saving | [progress-report-settings.test.tsx:60](../../frontend/src/features/reminders/ui/progress-report-settings.test.tsx#L60) | passed |
| <a id="t43"></a>T43 | progress report settings previews unsaved choices without saving and clears stale preview after a draft change | [progress-report-settings.test.tsx:81](../../frontend/src/features/reminders/ui/progress-report-settings.test.tsx#L81) | passed |
| <a id="t44"></a>T44 | progress report settings keeps a failed save's draft and allows disabling after the chat disconnects | [progress-report-settings.test.tsx:127](../../frontend/src/features/reminders/ui/progress-report-settings.test.tsx#L127) | passed |
| <a id="t45"></a>T45 | planning domain uses the supplied timezone and rejects nonexistent dates before persistence (0) | [domain.spec.ts:48](../../backend/test/domain.spec.ts#L48) | passed |
| <a id="t46"></a>T46 | planning domain uses the supplied timezone and rejects nonexistent dates before persistence (1) | [domain.spec.ts:48](../../backend/test/domain.spec.ts#L48) | passed |
| <a id="t47"></a>T47 | planning domain normalizes a goal and bounds monthly cadence by the actual month | [domain.spec.ts:60](../../backend/test/domain.spec.ts#L60) | passed |
| <a id="t48"></a>T48 | planning domain preserves tracking type and does not mutate the goal while validating a patch | [domain.spec.ts:74](../../backend/test/domain.spec.ts#L74) | passed |
| <a id="t49"></a>T49 | reminder domain postpones scheduled delivery at night, while an explicit question bypasses quiet hours and pause | [domain.spec.ts:99](../../backend/test/domain.spec.ts#L99) | passed |
| <a id="t50"></a>T50 | reminder domain allows correction of an existing entry, but never asks about another month | [domain.spec.ts:120](../../backend/test/domain.spec.ts#L120) | passed |
| <a id="t51"></a>T51 | reminder domain limits retries, respects a provider delay and never retries an ambiguous delivery | [domain.spec.ts:128](../../backend/test/domain.spec.ts#L128) | passed |
| <a id="t52"></a>T52 | reminder domain keeps the seven-day answer window separate from the one-day delivery window | [domain.spec.ts:143](../../backend/test/domain.spec.ts#L143) | passed |
| <a id="t53"></a>T53 | notes domain distinguishes clearing a body from an empty patch and leaves its input unchanged | [domain.spec.ts:156](../../backend/test/domain.spec.ts#L156) | passed |
| <a id="t54"></a>T54 | month rollover in D1 preserves definitions, group order and old facts; starts the new month with fresh IDs and no facts | [month-rollover.spec.ts:56](../../backend/test/month-rollover.spec.ts#L56) | passed |
| <a id="t55"></a>T55 | month rollover in D1 preserves visible order even when old goals have tied sort positions | [month-rollover.spec.ts:115](../../backend/test/month-rollover.spec.ts#L115) | passed |
| <a id="t56"></a>T56 | month rollover in D1 seals the destination exactly once under concurrent requests and never resurrects deleted copies | [month-rollover.spec.ts:128](../../backend/test/month-rollover.spec.ts#L128) | passed |
| <a id="t57"></a>T57 | month rollover in D1 preserves a manually planned destination even when all its goals are in trash | [month-rollover.spec.ts:149](../../backend/test/month-rollover.spec.ts#L149) | passed |
| <a id="t58"></a>T58 | month rollover in D1 clamps monthly occurrences in 2027-02 | [month-rollover.spec.ts:163](../../backend/test/month-rollover.spec.ts#L163) | passed |
| <a id="t59"></a>T59 | month rollover in D1 clamps monthly occurrences in 2028-02 | [month-rollover.spec.ts:163](../../backend/test/month-rollover.spec.ts#L163) | passed |
| <a id="t60"></a>T60 | month rollover in D1 clamps monthly occurrences in 2026-04 | [month-rollover.spec.ts:163](../../backend/test/month-rollover.spec.ts#L163) | passed |
| <a id="t61"></a>T61 | month rollover in D1 catches up from the latest known month without manufacturing skipped history, including December to January | [month-rollover.spec.ts:174](../../backend/test/month-rollover.spec.ts#L174) | passed |
| <a id="t62"></a>T62 | month rollover in D1 does not fall back to older goals after an empty or completely deleted latest month | [month-rollover.spec.ts:184](../../backend/test/month-rollover.spec.ts#L184) | passed |
| <a id="t63"></a>T63 | month rollover in D1 rechecks source definitions, order, deletion and the latest source month before committing | [month-rollover.spec.ts:194](../../backend/test/month-rollover.spec.ts#L194) | passed |
| <a id="t64"></a>T64 | month rollover in D1 rolls back the receipt if a goal insert fails, then allows a successful retry | [month-rollover.spec.ts:224](../../backend/test/month-rollover.spec.ts#L224) | passed |
| <a id="t65"></a>T65 | month rollover in D1 uses each owner's timezone at the actual month boundary | [month-rollover.spec.ts:251](../../backend/test/month-rollover.spec.ts#L251) | passed |
| <a id="t66"></a>T66 | reminder inheritance and scheduled rollover inherits scheduled and does not overwrite edits or reset the new schedule on repeat | [month-rollover.spec.ts:274](../../backend/test/month-rollover.spec.ts#L274) | passed |
| <a id="t67"></a>T67 | reminder inheritance and scheduled rollover inherits off and does not overwrite edits or reset the new schedule on repeat | [month-rollover.spec.ts:274](../../backend/test/month-rollover.spec.ts#L274) | passed |
| <a id="t68"></a>T68 | reminder inheritance and scheduled rollover inherits evening and does not overwrite edits or reset the new schedule on repeat | [month-rollover.spec.ts:274](../../backend/test/month-rollover.spec.ts#L274) | passed |
| <a id="t69"></a>T69 | reminder inheritance and scheduled rollover repairs incomplete reminder inheritance, even after a second month transition | [month-rollover.spec.ts:301](../../backend/test/month-rollover.spec.ts#L301) | passed |
| <a id="t70"></a>T70 | reminder inheritance and scheduled rollover initializes through Cron without a browser and sends only new-month goals exactly once | [month-rollover.spec.ts:313](../../backend/test/month-rollover.spec.ts#L313) | passed |
| <a id="t71"></a>T71 | authenticated plan reads materializes only the owner's current month; future and historical reads stay read-only | [month-rollover.spec.ts:348](../../backend/test/month-rollover.spec.ts#L348) | passed |
| <a id="t72"></a>T72 | reminder schedules handles quiet hours across midnight and disabled quiet hours | [reminders.spec.ts:100](../../backend/test/reminders.spec.ts#L100) | passed |
| <a id="t73"></a>T73 | reminder schedules uses local weekdays and handles both DST transitions once | [reminders.spec.ts:109](../../backend/test/reminders.spec.ts#L109) | passed |
| <a id="t74"></a>T74 | Telegram reminders with D1 handles help and stop commands before interpreting a reply to a question | [reminders.spec.ts:123](../../backend/test/reminders.spec.ts#L123) | passed |
| <a id="t75"></a>T75 | Telegram reminders with D1 keeps settings readable and scheduled work untouched when the bot is unavailable | [reminders.spec.ts:149](../../backend/test/reminders.spec.ts#L149) | passed |
| <a id="t76"></a>T76 | Telegram reminders with D1 replaces an unsent scheduled job when rescheduled on the same day, but retains sent events | [reminders.spec.ts:167](../../backend/test/reminders.spec.ts#L167) | passed |
| <a id="t77"></a>T77 | Telegram reminders with D1 replaces an unsent evening job when rescheduled on the same day, but retains sent events | [reminders.spec.ts:167](../../backend/test/reminders.spec.ts#L167) | passed |
| <a id="t78"></a>T78 | Telegram reminders with D1 does not enqueue a stale question when time change during a tick | [reminders.spec.ts:230](../../backend/test/reminders.spec.ts#L230) | passed |
| <a id="t79"></a>T79 | Telegram reminders with D1 does not enqueue a stale question when weekdays change during a tick | [reminders.spec.ts:230](../../backend/test/reminders.spec.ts#L230) | passed |
| <a id="t80"></a>T80 | Telegram reminders with D1 does not enqueue a stale question when mode change during a tick | [reminders.spec.ts:230](../../backend/test/reminders.spec.ts#L230) | passed |
| <a id="t81"></a>T81 | Telegram reminders with D1 does not enqueue a stale question when quiet hours change during a tick | [reminders.spec.ts:230](../../backend/test/reminders.spec.ts#L230) | passed |
| <a id="t82"></a>T82 | Telegram reminders with D1 does not enqueue a stale digest when evening time change | [reminders.spec.ts:273](../../backend/test/reminders.spec.ts#L273) | passed |
| <a id="t83"></a>T83 | Telegram reminders with D1 does not enqueue a stale digest when evening quiet hours change | [reminders.spec.ts:273](../../backend/test/reminders.spec.ts#L273) | passed |
| <a id="t84"></a>T84 | Telegram reminders with D1 records {"type":"check"} answers for the question date, even tomorrow | [reminders.spec.ts:308](../../backend/test/reminders.spec.ts#L308) | passed |
| <a id="t85"></a>T85 | Telegram reminders with D1 records {"type":"quantity","targetValue":10,"comparison":"atLeast"} answers for the question date, even tomorrow | [reminders.spec.ts:308](../../backend/test/reminders.spec.ts#L308) | passed |
| <a id="t86"></a>T86 | Telegram reminders with D1 records {"type":"scale","min":1,"max":5} answers for the question date, even tomorrow | [reminders.spec.ts:308](../../backend/test/reminders.spec.ts#L308) | passed |
| <a id="t87"></a>T87 | Telegram reminders with D1 records {"type":"time"} answers for the question date, even tomorrow | [reminders.spec.ts:308](../../backend/test/reminders.spec.ts#L308) | passed |
| <a id="t88"></a>T88 | Telegram reminders with D1 does not ask for existing false values or deleted goals | [reminders.spec.ts:320](../../backend/test/reminders.spec.ts#L320) | passed |
| <a id="t89"></a>T89 | Telegram reminders with D1 does not overwrite the website and requires a fresh correction after a conflict | [reminders.spec.ts:335](../../backend/test/reminders.spec.ts#L335) | passed |
| <a id="t90"></a>T90 | Telegram reminders with D1 atomically accepts only one concurrent answer and never reapplies a processed command | [reminders.spec.ts:366](../../backend/test/reminders.spec.ts#L366) | passed |
| <a id="t91"></a>T91 | Telegram reminders with D1 does not duplicate scheduled sends or snoozes on repeated updates | [reminders.spec.ts:392](../../backend/test/reminders.spec.ts#L392) | passed |
| <a id="t92"></a>T92 | Telegram reminders with D1 sends one evening digest, preserves button identities and updates it after answers | [reminders.spec.ts:408](../../backend/test/reminders.spec.ts#L408) | passed |
| <a id="t93"></a>T93 | Telegram reminders with D1 validates the current scale after its range changes while a question is open | [reminders.spec.ts:439](../../backend/test/reminders.spec.ts#L439) | passed |
| <a id="t94"></a>T94 | Telegram reminders with D1 retries 429, pauses blocked chats, and does not retry ambiguous sends | [reminders.spec.ts:454](../../backend/test/reminders.spec.ts#L454) | passed |
| <a id="t95"></a>T95 | Telegram reminders with D1 expires the permanent delivery warning after 24 hours without erasing or retrying the job | [reminders.spec.ts:480](../../backend/test/reminders.spec.ts#L480) | passed |
| <a id="t96"></a>T96 | Telegram reminders with D1 expires the unknown delivery warning after 24 hours without erasing or retrying the job | [reminders.spec.ts:480](../../backend/test/reminders.spec.ts#L480) | passed |
| <a id="t97"></a>T97 | Telegram reminders with D1 ignores other senders, arbitrary text, and questions after disconnect | [reminders.spec.ts:512](../../backend/test/reminders.spec.ts#L512) | passed |
| <a id="t98"></a>T98 | Telegram reminders with D1 requires confirmation of an expiring, one-use connection token | [reminders.spec.ts:531](../../backend/test/reminders.spec.ts#L531) | passed |
| <a id="t99"></a>T99 | reminder HTTP contracts enforces owner and Origin, and uses the saved timezone for planning dates | [reminders.spec.ts:558](../../backend/test/reminders.spec.ts#L558) | passed |
| <a id="t100"></a>T100 | reminder runtime integration runs the Worker cron and accepts a real-shaped Telegram webhook through grammY | [reminders.spec.ts:631](../../backend/test/reminders.spec.ts#L631) | passed |
| <a id="t101"></a>T101 | reminder runtime integration postpones quiet-hour sends with the original date and skips goals from another month | [reminders.spec.ts:705](../../backend/test/reminders.spec.ts#L705) | passed |
| <a id="t102"></a>T102 | reminder runtime integration recovers a crashed delivery as unknown and cancels pending work when disabled | [reminders.spec.ts:744](../../backend/test/reminders.spec.ts#L744) | passed |

## Расчётные примеры

[Записанные expected/actual](evidence/acceptance-calculations.json).

| ID | Проверка | Результат |
| --- | --- | --- |
| <a id="p01"></a>P01 | §3, §4.1, К1: включительный старт и исключённая история | **pass** |
| <a id="p02"></a>P02 | §4.1, К2: четыре выполнения, false, отсутствие записи | **pass** |
| <a id="p03"></a>P03 | §4.1, К6: ноль входит в среднее, отсутствие не заменяется нулём | **pass** |
| <a id="p04"></a>P04 | §4.2, К6: atLeast, граница включительна | **pass** |
| <a id="p05"></a>P05 | §4.2, К6: atMost, граница включительна | **pass** |
| <a id="p06"></a>P06 | §4.2, К6: equal, граница включительна | **pass** |
| <a id="p07"></a>P07 | §4.2, К6: условия времени, в том числе через полночь | **pass** |
| <a id="p08"></a>P08 | §4.2, К6: условия времени, в том числе через полночь | **pass** |
| <a id="p09"></a>P09 | §4.2, К6: условия времени, в том числе через полночь | **pass** |
| <a id="p10"></a>P10 | §4.2, К5: шкала является наблюдением | **pass** |
| <a id="p11"></a>P11 | §4.2: время без границ не имеет среднего и оценки успеха | **pass** |
| <a id="p12"></a>P12 | §4.3, К3: месячный план 20 → 17, исходная настройка сохранена | **pass** |
| <a id="p13"></a>P13 | §4.3, К4: в среду 2 из 3, будущие дни не пропуски | **pass** |
| <a id="p14"></a>P14 | §4.3: превышение плана не теряется | **pass** |
| <a id="p15"></a>P15 | §4.3: недельная цель в месяце имеет строки недель и не месячный процент | **pass** |
| <a id="p16"></a>P16 | §4.4: ΣR/ΣD и разные даты, без суммирования единиц | **pass** |
| <a id="p17"></a>P17 | §4.4: при отсутствии дневных целей нет дневной заполненности | **pass** |
| <a id="p18"></a>P18 | §3, К7: нет нулевых процентов вне периода | **pass** |
| <a id="p19"></a>P19 | §3, К7: нет нулевых процентов вне периода | **pass** |
| <a id="p20"></a>P20 | §3, К7: очистка и перенос назад возвращают историю | **pass** |
| <a id="p21"></a>P21 | §4.4, №27: сегодня пусто — подтверждённая серия до вчера | **pass** |
| <a id="p22"></a>P22 | §4.4, №27: явное невыполнение обрывает серию | **pass** |
| <a id="p23"></a>P23 | §4.4, №27: отсутствие вчера и сегодня обрывает серию | **pass** |
| <a id="p24"></a>P24 | §4.4: исторический период не имеет текущей серии | **pass** |
| <a id="p25"></a>P25 | §4.4: серия ограничена датой учёта | **pass** |
| <a id="p26"></a>P26 | §4.4, К15: сопоставимые дни недели и исходные числа | **pass** |
| <a id="p27"></a>P27 | §4.4, F02: 2/3 − 1/3 округляется в +33 п. п. | **fail** |
| <a id="p28"></a>P28 | §4.4, К15: первая неделя не сравнивается с исключённой | **pass** |
| <a id="p29"></a>P29 | §4.4, №27: месяцы 18/21 и 15/21; суммы 520 и 430 | **pass** |
| <a id="p30"></a>P30 | §4.4, F02: 18/21 − 15/21 округляется в +14 п. п. | **fail** |
| <a id="p31"></a>P31 | §4.4: короткий предыдущий месяц не сравнивается | **pass** |
| <a id="p32"></a>P32 | §4.5, К13: две части объединяются, округление один раз | **pass** |
| <a id="p33"></a>P33 | §4.5, К13: одинаковые названия без связи не объединяются | **pass** |
| <a id="p34"></a>P34 | §4.5, №27: разные правила разделены; сравнение отсутствует | **pass** |
| <a id="p35"></a>P35 | §4.5, №27: неподготовленный ноябрь — исходный план без процента | **pass** |
| <a id="p36"></a>P36 | §4.2–4.5: поведение независимо от названия; все типы × частоты | **pass** |
| <a id="p37"></a>P37 | §7.1, F12: сводка без записей ведёт в план | **fail** |
| <a id="p38"></a>P38 | §7.1, К17: длинные названия, бюджет, скрытые цели, общая сумма | **pass** |
| <a id="p39"></a>P39 | §7.1, К4: месячный план отдельно от недельного факта | **pass** |

## Браузерные проверки

[Записанные expected/actual](evidence/acceptance-browser.json).

| ID | Проверка | Результат |
| --- | --- | --- |
| <a id="b01"></a>B01 | §5, №34: график доступен с клавиатуры и связан с фактом | **pass** |
| <a id="b02"></a>B02 | §3, №22: Escape отменяет дату без записи | **pass** |
| <a id="b03"></a>B03 | §6, №25: поиск и единичный выбор сохраняют скрытые цели | **pass** |
| <a id="b04"></a>B04 | §6, №25, F01: снять найденные сохраняет скрытый выбор | **fail** |
| <a id="b05"></a>B05 | §6, №25: нулевой поиск отличается от пустого выбора | **pass** |
| <a id="b06"></a>B06 | §6, №24: загрузка, ошибка и повтор чтения настроек | **pass** |
| <a id="b07"></a>B07 | §6, №24: формирование и ошибка предпросмотра, без сохранения | **pass** |
| <a id="b08"></a>B08 | §6, №24: ошибка сохранения оставляет черновик | **pass** |
| <a id="b09"></a>B09 | §5: шесть примеров всех пяти типов данных читаемы на 320/390/1440 без горизонтального переполнения | **pass** |
| <a id="b10"></a>B10 | §5: восемь состояний на трёх ширинах, без горизонтального переполнения | **pass** |
| <a id="b11"></a>B11 | §5, F03: мобильный календарь месяца сохраняет значки результатов | **fail** |
| <a id="b12"></a>B12 | §5, №19, F15: недоступная цель даёт возврат к списку | **fail** |
| <a id="b13"></a>B13 | №34, F16: редактор правил имеет явную отмену черновика | **fail** |

## Как повторить

Из корня, Node 24 и pnpm 11.15.1, после обычной установки зависимостей:

```sh
node --import ./frontend/node_modules/tsx/dist/loader.mjs docs/progress-design-audit-2026-10-08/verify-calculations.ts
```

Скрипт только вызывает чистые функции и записывает JSON в evidence. Сейчас ожидается
код выхода 1: P27/P30 — округление разности, P37 — неверная кнопка. Это реальные
непройденные условия приёмки, их нельзя считать успешным тестом.

Для браузера запустить `pnpm --dir frontend dev --host 127.0.0.1 --port 5188 --strictPort`.
Нужны установленный Chrome и Playwright (зависимость приложения не добавлялась).
Вторым аргументом указать путь к уже установленному модулю Playwright, либо не передавать
аргумент, если пакет доступен как `playwright`:

```sh
node --import ./frontend/node_modules/tsx/dist/loader.mjs docs/progress-design-audit-2026-10-08/verify-browser.ts /absolute/path/to/playwright/index.mjs
```

Этот скрипт обращается только к loopback; API перехвачен вымышленными ответами.
Он проверяет UI, а не backend/Telegram/настоящий вход. Сейчас код выхода 1 отражает
B04/F01, B11/F03, B12/F15, B13/F16. B09 проверяет 18 деталей (6 примеров × 3 ширины),
B10 — 24 комбинации основных состояний и ширин. Ошибок JavaScript и неперехваченных
API-запросов в итоговом запуске нет. При изменении кода результаты следует переснять.

Выбранные тесты можно повторить командами:

```sh
pnpm --dir backend exec vitest run test/progress.spec.ts test/progress-reports.spec.ts test/month-rollover.spec.ts test/reminders.spec.ts test/domain.spec.ts
pnpm --dir frontend exec vitest run src/widgets/progress/ui/progress-view.test.tsx src/features/progress-settings/ui/progress-start-date.test.tsx src/features/reminders/ui/progress-report-settings.test.tsx
pnpm check
pnpm boundaries:check
```

Проверки локальны и не заменяют GitHub CI, production-приёмку или настоящую Telegram-доставку.
Приёмка шрифтов/цветов/отступов всех фреймов всё ещё V10; реальный внешний smoke — V13/V14.

[Итог обязательных проверок](evidence/acceptance-gates.json): `pnpm check` и
`pnpm boundaries:check` завершились с кодом 0. В полном gate frontend дал 127
тестов, backend — 204; проверки ChatGPT и monolith smoke также прошли.
Остались прежние предупреждения lint/архитектуры и размера bundle. Код приложения
не изменялся; новых предупреждений проверки пакетов эта документация не добавляет.
