// API is intercepted only on loopback. Pass an installed Playwright module as argv[2].
import { deepStrictEqual } from "node:assert";
import { writeFileSync } from "node:fs";
import { detailedSources, fixtures, overview, unboundedSource } from "./browser-fixtures.ts";

import { createHarness } from "./browser-harness.ts";
const { browser, page, control, pageErrors, unhandled, progress, reports, overflow } = await createHarness();
const cases: { id: string; requirement: string; expected: unknown; actual: unknown; status: string }[] = [];
async function check(
  id: string,
  requirement: string,
  expected: unknown,
  read: () => Promise<unknown>,
) {
  let actual: unknown;
  try {
    actual = await read();
    deepStrictEqual(actual, expected);
    cases.push({ id, requirement, expected, actual, status: "pass" });
  } catch (error) {
    cases.push({ id, requirement, expected, actual: actual ?? String(error), status: "fail" });
  }
  console.log(`${cases.at(-1)?.status.toUpperCase()} ${id}`);
}

try {
  await check(
    "B01",
    "§5, №34: график доступен с клавиатуры и связан с фактом",
    [true, true, true],
    async () => {
      await progress("ready", "reading");
      const a = page.locator('svg[role="img"] a').first();
      await a.focus();
      await page.getByRole("tooltip").waitFor();
      return [
        await a.evaluate((node) => document.activeElement === node),
        await page.getByRole("tooltip").isVisible(),
        /goal=reading&date=2026-10-19/.test(await a.getAttribute("href")),
      ];
    },
  );
  await check("B02", "§3, №22: Escape отменяет дату без записи", 0, async () => {
    await progress();
    const before = control.writes;
    await page.getByRole("button", { name: /Учитываем с/ }).click();
    await page.getByLabel("Дата начала учёта").fill("2026-12-12");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    return control.writes - before;
  });
  await check(
    "B03",
    "§6, №25: поиск и единичный выбор сохраняют скрытые цели",
    [true, true],
    async () => {
      await reports();
      await page.getByLabel("Поиск целей для отчёта").fill("Чтение");
      await page.getByRole("checkbox", { name: "Чтение", exact: true }).uncheck();
      await page.getByLabel("Поиск целей для отчёта").fill("");
      return [
        await page.getByRole("checkbox", { name: "Вода", exact: true }).isChecked(),
        await page.getByRole("checkbox", { name: "Тренировки", exact: true }).isChecked(),
      ];
    },
  );
  await check(
    "B04",
    "§6, №25, F01: снять найденные сохраняет скрытый выбор",
    [true, true],
    async () => {
      await reports();
      await page.getByLabel("Поиск целей для отчёта").fill("Чтение");
      await page.getByRole("button", { name: "Снять найденные", exact: true }).click();
      await page.getByLabel("Поиск целей для отчёта").fill("");
      return [
        await page.getByRole("checkbox", { name: "Вода", exact: true }).isChecked(),
        await page.getByRole("checkbox", { name: "Тренировки", exact: true }).isChecked(),
      ];
    },
  );
  await check(
    "B05",
    "§6, №25: нулевой поиск отличается от пустого выбора",
    [true, true],
    async () => {
      await reports();
      await page.getByLabel("Поиск целей для отчёта").fill("небывалая цель");
      return [
        await page.getByText("Поиск не дал результатов", { exact: true }).isVisible(),
        await page.getByText("3 из 5", { exact: true }).isVisible(),
      ];
    },
  );
  await check(
    "B06",
    "§6, №24: загрузка, ошибка и повтор чтения настроек",
    [true, true, true],
    async () => {
      await reports("report-loading");
      const pending = await page
        .getByText("Загружаем настройки отчётов…", { exact: true })
        .isVisible();
      await reports("report-error");
      await page.getByText("Не удалось загрузить настройки отчётов.", { exact: true }).waitFor();
      const error = await page.getByRole("alert").isVisible();
      control.mode = "ready";
      await page.getByRole("button", { name: "Повторить", exact: true }).click();
      await page.getByLabel("Среда").waitFor();
      return [pending, error, await page.getByLabel("Среда").isVisible()];
    },
  );
  await check(
    "B07",
    "§6, №24: формирование и ошибка предпросмотра, без сохранения",
    [true, true, 0],
    async () => {
      await reports();
      const before = control.writes;
      control.mode = "preview-pending";
      await page.getByRole("button", { name: "Показать предпросмотр", exact: true }).click();
      const pending = await page
        .getByRole("button", { name: "Формируем…", exact: true })
        .isDisabled();
      await page.getByRole("button", { name: "Показать предпросмотр", exact: true }).waitFor();
      control.mode = "preview-error";
      await page.getByRole("button", { name: "Показать предпросмотр", exact: true }).click();
      await page.getByRole("alert").waitFor();
      return [pending, await page.getByRole("alert").isVisible(), control.writes - before];
    },
  );
  await check("B08", "§6, №24: ошибка сохранения оставляет черновик", "22:30", async () => {
    await reports("save-error");
    await page.getByLabel("Среда").fill("22:30");
    await page.getByRole("button", { name: "Сохранить настройки отчётов", exact: true }).click();
    await page.getByRole("alert").waitFor();
    return page.getByLabel("Среда").inputValue();
  });
  await check(
    "B09",
    "§5: шесть примеров всех пяти типов данных читаемы на 320/390/1440 без горизонтального переполнения",
    18,
    async () => {
      let count = 0;
      for (const width of [320, 390, 1440])
        for (const g of detailedSources) {
          await page.setViewportSize({ width, height: 1100 });
          await progress("ready", g.id);
          if (!(await overflow())) throw new Error(`Overflow ${width} ${g.tracking.type}`);
          if (
            !(await page.getByRole("heading", { name: /Записи (по дням|за период|и прошлый период)/, exact: true }).isVisible())
          )
            throw new Error("No text values");
          count++;
        }
      return count;
    },
  );
  await check(
    "B10",
    "§5: восемь состояний на трёх ширинах, без горизонтального переполнения",
    24,
    async () => {
      let count = 0;
      const states = [
        ["empty", "За этот период пока нет записей"],
        ["no-goals", "В этом периоде пока нет целей"],
        ["before-start", "Период раньше начала учёта"],
        ["future-start", "Учёт начнётся"],
        ["error", "Не удалось загрузить статистику"],
        ["missing", "Цель удалена или недоступна"],
        ["ready", "Фильтр не дал результатов"],
        ["loading", "Загружаем статистику"],
      ];
      for (const width of [320, 390, 1440])
        for (const [stateMode, text] of states) {
          await page.setViewportSize({ width, height: 1100 });
          await progress(
            stateMode,
            stateMode === "missing" ? "reading" : "",
            stateMode === "ready" ? "&empty=1" : "",
          );
          if (stateMode === "loading") await page.getByLabel(text, { exact: true }).waitFor();
          else await page.getByText(new RegExp(text)).first().waitFor();
          if (!(await overflow())) throw new Error(`Overflow ${width} ${stateMode}`);
          count++;
        }
      return count;
    },
  );
  await check(
    "B11",
    "§5, F03: мобильный календарь месяца сохраняет значки результатов",
    true,
    async () => {
      await page.setViewportSize({ width: 320, height: 1100 });
      await progress("ready", "", "&period=month");
      const calendar = page
        .getByRole("heading", { name: "Активность по дням", exact: true })
        .locator("..")
        .locator("..");
      const visible = await calendar
        .locator("button svg")
        .evaluateAll((nodes) => nodes.some((node) => node.getBoundingClientRect().width > 0));
      return visible;
    },
  );
  await check("B12", "§5, №19, F15: недоступная цель даёт возврат к списку", true, async () => {
    await progress("missing", "reading");
    await page.getByText("Цель удалена или недоступна", { exact: true }).waitFor();
    const available = await page.getByRole("button", { name: "Все цели", exact: true }).isVisible();
    control.mode = "ready";
    await page.getByRole("button", { name: "Все цели", exact: true }).click();
    await page.getByRole("heading", { name: "Активность по дням", exact: true }).waitFor();
    return available && !new URL(page.url()).searchParams.has("goal");
  });
  await check("B13", "№34, F16: отмена правила сбрасывает черновик без PATCH", ["20", 0], async () => {
    await progress("ready", "reading");
    const before = control.writes;
    await page.locator("summary").filter({ hasText: "Изменить правило" }).click();
    await page.getByLabel("Порог").fill("30");
    await page.getByRole("button", { name: "Отмена", exact: true }).click();
    await page.locator("summary").filter({ hasText: "Изменить правило" }).click();
    return [await page.getByLabel("Порог").inputValue(), control.writes - before];
  });
  await check("B14", "V04: периоды восстанавливаются из URL после reload/back/forward", ["2026-10-12", "2026-10-12", "2026-10-12", "2026-10-21", "month", "week", "month"], async () => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    control.startsOn = "2026-10-06";
    await progress();
    const result: string[] = [];
    const anchor = () => new URL(page.url()).searchParams.get("anchor")!;
    await page.getByRole("button", { name: "Предыдущий период", exact: true }).click();
    await page.getByRole("button", { name: "К текущему периоду" }).waitFor();
    result.push(anchor());
    await page.reload();
    await page.getByRole("button", { name: "К текущему периоду" }).waitFor();
    result.push(anchor());
    await page.getByRole("button", { name: "Следующий период", exact: true }).click();
    await page.getByRole("button", { name: "К текущему периоду" }).waitFor({ state: "hidden" });
    await page.goBack();
    await page.getByRole("button", { name: "К текущему периоду" }).waitFor();
    result.push(anchor());
    await page.getByRole("button", { name: "К текущему периоду" }).click();
    result.push(anchor());
    await page.getByRole("button", { name: "Месяц", exact: true }).click();
    result.push(new URL(page.url()).searchParams.get("period")!);
    await page.goBack();
    result.push(new URL(page.url()).searchParams.get("period") ?? "week");
    await page.goForward();
    result.push(new URL(page.url()).searchParams.get("period")!);
    return result;
  });
  await check("B15", "V04: фильтр с клавиатуры, cancel/фокус/пустой выбор; состав отчёта не меняется", [true, true, true, 0, true], async () => {
    await progress();
    const before = control.writes;
    const trigger = page.getByRole("button", { name: "Все цели", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.getByRole("checkbox", { name: "Чтение", exact: true }).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const focus = await trigger.evaluate((node) => document.activeElement === node);
    await page.keyboard.press("Enter");
    const restored = await page.getByRole("checkbox", { name: "Чтение", exact: true }).isChecked();
    await page.getByRole("button", { name: "Снять все", exact: true }).click();
    await page.getByRole("button", { name: "Применить", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "Фильтр не дал результатов", exact: true }).waitFor();
    const empty = new URL(page.url()).searchParams.get("empty") === "1";
    await page.getByRole("button", { name: "Показать все цели", exact: true }).click();
    await page.getByRole("heading", { name: "Активность по дням", exact: true }).waitFor();
    return [focus, restored, empty, control.writes - before, control.state.goals.filter((goal) => goal.included).length === 3];
  });
  await check("B16", "№21–22, V04: неверная дата, переход клавишей через месяц, будущий черновик и cancel", [true, "2026-11-01", true, 0, true], async () => {
    await progress();
    const before = control.writes;
    const trigger = page.getByRole("button", { name: /Учитываем с/ });
    await trigger.focus(); await page.keyboard.press("Enter");
    await page.getByLabel("Дата начала учёта").fill("2026-02-29");
    const invalid = await page.getByRole("alert").isVisible() && await page.getByRole("button", { name: "Сохранить", exact: true }).isDisabled();
    await page.getByLabel("Дата начала учёта").fill("2026-10-31");
    await page.getByRole("button", { name: /^31 окт/ }).focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("1 нояб"));
    await page.keyboard.press("Enter");
    const draft = await page.getByLabel("Дата начала учёта").inputValue();
    const future = await page.getByText(/До этой даты отчёты не отправляются/).isVisible();
    await page.getByRole("button", { name: "Отмена", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    return [invalid, draft, future, control.writes - before, await trigger.evaluate((node) => document.activeElement === node)];
  });
  await check("B17", "V01/V04: ошибка даты сохраняет прежнее значение; retry/pending/Escape, общий старт в двух формах", [true, true, true, true, "2026-10-07"], async () => {
    control.startsOn = "2026-10-06";
    await progress();
    await page.getByRole("button", { name: /Учитываем с/ }).click();
    await page.getByLabel("Дата начала учёта").fill("2026-10-07");
    control.mode = "date-error";
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await page.getByRole("alert").waitFor();
    const old = control.startsOn === "2026-10-06";
    const draft = await page.getByLabel("Дата начала учёта").inputValue() === "2026-10-07";
    control.mode = "date-pending";
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await page.getByRole("button", { name: "Сохраняем…", exact: true }).waitFor();
    const pending = await page.getByLabel("Дата начала учёта").isDisabled();
    await page.keyboard.press("Escape");
    const stays = await page.getByRole("dialog").isVisible();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByText("Дата сохранена · статистика обновлена", { exact: true }).waitFor();
    await reports("ready", { ...fixtures.reportState, startsOn: control.startsOn });
    return [old, draft, pending, stays, await page.getByLabel("Учитывать прогресс с").inputValue()];
  });
  await check("B18", "№24–25: отмена формы восстанавливает выбор/дату/время, без сохранения", ["21:00", "2026-10-06", 3, 0], async () => {
    await reports();
    const before = control.writes;
    await page.getByLabel("Среда").fill("22:30");
    await page.getByLabel("Учитывать прогресс с").fill("2026-10-07");
    await page.getByRole("button", { name: "Снять все", exact: true }).click();
    await page.getByRole("button", { name: "Отмена", exact: true }).click();
    return [await page.getByLabel("Среда").inputValue(), await page.getByLabel("Учитывать прогресс с").inputValue(), await page.getByRole("checkbox", { checked: true }).count(), control.writes - before];
  });
  await check("B19", "№24, V11: повтор ошибки формы, pending блокирует поля; успех и новое расписание", [true, true, true, true, "22:30"], async () => {
    await reports("save-error", { ...fixtures.reportState, settings: { ...fixtures.reportState.settings, enabled: true }, state: "ready" });
    await page.getByLabel("Среда").fill("22:30");
    await page.getByRole("button", { name: "Сохранить настройки отчётов", exact: true }).click();
    await page.getByRole("alert").waitFor();
    const old = control.state.settings.wednesdayTime === "21:00";
    const draft = await page.getByLabel("Среда").inputValue() === "22:30";
    control.mode = "save-pending";
    await page.getByRole("button", { name: "Сохранить настройки отчётов", exact: true }).click();
    await page.getByRole("button", { name: "Сохраняем…", exact: true }).waitFor();
    const pending = await page.getByLabel("Среда").isDisabled() && await page.getByRole("checkbox", { name: "Чтение", exact: true }).isDisabled();
    await page.getByText("Настройки отчётов сохранены", { exact: true }).waitFor();
    return [old, draft, pending, control.state.nextRuns.length === 2, control.state.settings.wednesdayTime];
  });
  await check("B20", "№24: переключение слота, сброс устаревшего preview, буквальные имена безопасны", [true, true, true, 0], async () => {
    const original = control.sources;
    try {
      control.sources = original.map((goal) => goal.id === "reading" ? { ...goal, title: "<b>Текст & *_</b>" } : goal);
      await reports();
      const before = control.writes;
      await page.getByRole("button", { name: "Показать предпросмотр", exact: true }).click();
      await page.getByRole("heading", { name: "<b>Текст & *_</b>", exact: true }).waitFor();
      const literal = await page.getByRole("heading", { name: "<b>Текст & *_</b>", exact: true }).locator("b").count() === 0;
      await page.getByRole("button", { name: "Воскресенье", exact: true }).click();
      const cleared = await page.getByRole("heading", { name: "<b>Текст & *_</b>", exact: true }).count() === 0;
      await page.getByRole("button", { name: "Показать предпросмотр", exact: true }).click();
      await page.getByRole("heading", { name: "Ритм · Итоги недели", exact: true }).waitFor();
      return [literal, cleared, control.requests.filter((req) => req.path.endsWith("/preview")).at(-1)?.body.slot === "sun", control.writes - before];
    } finally { control.sources = original; }
  });
  await check("B21", "№23: переключатели вопросов и отчётов независимы; переходы в формы", [true, true, true, true], async () => {
    control.state = { ...structuredClone(fixtures.reportState), settings: { ...fixtures.reportState.settings, enabled: true }, state: "ready" };
    control.questionEnabled = true;
    await page.goto("http://127.0.0.1:5188/plans/2026-10/reminders");
    await page.getByRole("switch", { name: "Напоминания о заполнении", exact: true }).click();
    await page.getByText(/Выключены ·/).first().waitFor();
    const independent = await page.getByRole("switch", { name: "Отчёты о прогрессе", exact: true }).isChecked();
    await page.getByRole("switch", { name: "Отчёты о прогрессе", exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLInputElement>('input[role="switch"]')].every((node) => !node.checked));
    const questions = !control.questionEnabled;
    await page.getByRole("link", { name: "Настроить отчёты", exact: true }).click();
    await page.getByLabel("Среда").waitFor();
    const reportForm = await page.getByRole("heading", { name: "Отчёты о прогрессе", exact: true }).isVisible();
    await page.getByRole("link", { name: "Все сообщения", exact: true }).click();
    await page.getByRole("link", { name: "Настроить напоминания", exact: true }).click();
    await page.getByRole("heading", { name: "Telegram", exact: true }).waitFor();
    return [independent, questions, reportForm, new URL(page.url()).searchParams.get("tab") === "reminders"];
  });
  await check("B22", "V05: сохранение правила с ошибкой/retry/pending пересчитывает текущую версию; факты открываются в плане", [true, true, true, "30", true], async () => {
    control.sources = structuredClone(detailedSources);
    control.startsOn = "2026-10-06";
    await progress("ready", "reading");
    await page.locator("summary").filter({ hasText: "Изменить правило" }).click();
    await page.getByLabel("Порог").fill("30");
    control.mode = "rule-error";
    await page.getByRole("button", { name: "Сохранить и пересчитать", exact: true }).click();
    await page.getByRole("alert").waitFor();
    const old = control.sources.find((goal) => goal.id === "reading")!.tracking.targetValue === 20;
    const draft = await page.getByLabel("Порог").inputValue() === "30";
    control.mode = "rule-pending";
    await page.getByRole("button", { name: "Сохранить и пересчитать", exact: true }).click();
    await page.getByRole("button", { name: "Пересчитываем…", exact: true }).waitFor();
    const pending = await page.getByLabel("Порог").isDisabled() && await page.getByRole("button", { name: "Отмена", exact: true }).isDisabled();
    await page.getByRole("heading", { name: "Чтение", exact: true }).waitFor();
    await page.getByText(/Не менее 30 страниц/).waitFor();
    await page.locator("summary").filter({ hasText: "Изменить правило" }).click();
    const threshold = await page.getByLabel("Порог").inputValue();
    await page.getByRole("link", { name: /^Изменить · 21 окт/ }).click();
    await page.getByLabel(/Факт за день: Чтение/).waitFor();
    const opened = new URL(page.url()).searchParams.get("date") === "2026-10-21" && await page.getByLabel(/Факт за день: Чтение/).inputValue() === "25";
    return [old, draft, pending, threshold, opened];
  });
  await check("B23", "V01: Темп плана использует ту же общую дату и серверный знаменатель", ["3 / 3", "2 / 2"], async () => {
    control.sources = structuredClone(detailedSources);
    control.startsOn = "2026-10-06";
    await page.goto("http://127.0.0.1:5188/plans/2026-10");
    await page.getByRole("region", { name: "Темп: Чтение", exact: true }).waitFor();
    const first = await page.getByRole("region", { name: "Темп: Чтение", exact: true }).locator("span").first().innerText();
    control.startsOn = "2026-10-20";
    await page.reload();
    await page.getByRole("region", { name: "Темп: Чтение", exact: true }).waitFor();
    const second = await page.getByRole("region", { name: "Темп: Чтение", exact: true }).locator("span").first().innerText();
    return [first, second];
  });
  await check("B24", "V08: наблюдения/недневные цели скрывают неприменимые сводки и календарь", [true, true, true, true], async () => {
    const original = control.sources;
    try {
      control.sources = original.filter((goal) => goal.cadence.period === "week");
      await page.goto("http://127.0.0.1:5188/plans/2026-10/progress?anchor=2026-10-21");
      await page.getByRole("heading", { name: "Цели 1" }).waitFor();
      const flexible = await page.getByRole("heading", { name: "Активность по дням" }).count() === 0 && await page.getByText(/Ежедневных записей/).count() === 0;
      control.sources = original.filter((goal) => goal.tracking.type === "scale");
      await page.reload();
      await page.getByRole("heading", { name: "Цели 1" }).waitFor();
      const observations = await page.getByRole("heading", { name: "Активность по дням" }).count() === 0;
      const daily = await page.getByText(/Ежедневных записей/).count() > 0;
      return [flexible, observations, daily, await overflow()];
    } finally { control.sources = original; }
  });
  await check("B25", "№24: invalid time, paused/deleted, retry/unknown/failed объясняются отдельно", [true, true, true, true, true], async () => {
    await reports("ready", { ...fixtures.reportState, settings: { ...fixtures.reportState.settings, enabled: true }, goals: [], state: "no-goals", delivery: { retrying: 1, unknown: 1, failed: 1 } });
    const paused = await page.getByText(/Все выбранные цели удалены/).isVisible();
    const retry = await page.getByText(/Временная ошибка Telegram/).isVisible();
    const unknown = await page.getByText(/Повторно этот отчёт не отправляем/).isVisible();
    const failed = await page.getByText(/Не удалось доставить отчёты/).isVisible();
    await page.getByLabel("Среда").fill("");
    const time = await page.getByText(/Укажите время в формате/).isVisible() && await page.getByRole("button", { name: "Сохранить настройки отчётов", exact: true }).isDisabled();
    return [paused, retry, unknown, failed, time];
  });
  await check("B27", "pen.dev №06/33: отдельный mobile preview с клавиатуры, возврат фокуса, без сохранения", [true, true, true, true, true, 0], async () => {
    await page.setViewportSize({ width: 320, height: 900 });
    await reports();
    const before = control.writes;
    const hidden = await page.getByRole("button", { name: "Показать предпросмотр", exact: true }).count() === 0;
    const trigger = page.getByRole("button", { name: "Предпросмотр отчёта", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Воскресенье", exact: true }).click();
    await dialog.getByRole("button", { name: "Показать предпросмотр", exact: true }).click();
    await dialog.getByRole("heading", { name: "Ритм · Итоги недели", exact: true }).waitFor();
    const shown = await dialog.getByRole("heading", { name: "Ритм · Итоги недели", exact: true }).isVisible();
    const fits = await overflow();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    const focus = await trigger.evaluate((node) => document.activeElement === node);
    await progress();
    await page.getByRole("button", { name: /Учитываем с/ }).click();
    const bounds = await page.getByRole("dialog").boundingBox();
    return [hidden, shown, fits, focus, bounds?.x === 0 && bounds?.width === 320, control.writes - before];
  });
  await check("B28", "§4.3/5: недельная цель в месячных деталях имеет подписи отдельных недель без общего месячного процента", 3, async () => {
    let count = 0;
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await progress("ready", "training", "&period=month");
      const card = page.getByRole("heading", { name: "Выполнено", exact: true }).locator("..");
      const text = await card.innerText();
      if (!["5 окт", "12 окт", "19 окт", "26 окт"].every((date) => text.includes(date)) || !await overflow() || await page.getByRole("heading", { name: "Осталось по плану", exact: true }).count()) throw new Error(`Incorrect month detail ${width}`);
      count++;
    }
    return count;
  });
  await check("B26", "V07: ссылки отчёта требуют входа и сохраняют исходный адрес", true, async () => {
    control.authenticated = false;
    try {
      const destination = "/plans/2026-10/progress?period=week&anchor=2026-10-05";
      await page.goto(`http://127.0.0.1:5188${destination}`);
      await page.waitForURL("**/login?**");
      return new URL(page.url()).searchParams.get("returnTo") === destination;
    } finally { control.authenticated = true; }
  });
} finally {
  const totals = {
    passed: cases.filter((r) => r.status === "pass").length,
    failed: cases.filter((r) => r.status === "fail").length,
  };
  writeFileSync(
    new URL("./evidence/acceptance-browser.json", import.meta.url),
    JSON.stringify(
      {
        sourceRevision: process.env.ACCEPTANCE_REVISION ?? "working-tree: fix/progress-complete",
        method:
          "Local Chrome; synthetic API interception. No backend/production/Telegram integration is claimed.",
        totals,
        cases,
        pageErrors,
        unhandled,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ totals, pageErrors, unhandled }));
  await browser.close();
  process.exitCode = totals.failed || pageErrors.length || unhandled.length ? 1 : 0;
}
