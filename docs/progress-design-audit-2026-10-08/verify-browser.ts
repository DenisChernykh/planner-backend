// API is intercepted only on loopback. Pass an installed Playwright module as argv[2].
import { deepStrictEqual } from "node:assert";
import { writeFileSync } from "node:fs";
import { detailedSources, fixtures, overview, unboundedSource } from "./browser-fixtures.ts";

const { chromium } = await import(process.argv[2] ?? "playwright");
const origin = "http://127.0.0.1:5188";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const cases: {
  id: string;
  requirement: string;
  expected: unknown;
  actual: unknown;
  status: string;
}[] = [];
const pageErrors: string[] = [];
const unhandled: string[] = [];
let mode = "ready",
  writes = 0;
let state = structuredClone(fixtures.reportState);
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  reducedMotion: "reduce",
});
await context.addInitScript({
  content: `
  const NativeDate = Date;
  class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [NativeDate.parse("2026-10-21T16:00:00Z")])); }
    static now() { return NativeDate.parse("2026-10-21T16:00:00Z"); }
  }
  globalThis.Date = FixedDate;
`,
});
await context.route(`${origin}/api/**`, async (route) => {
  const req = route.request(),
    u = new URL(req.url()),
    p = u.pathname;
  if (u.origin !== origin) throw new Error("Only loopback API calls are permitted");
  const json = (body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: status >= 400 ? "application/problem+json" : "application/json",
      body: JSON.stringify(body),
    });
  if (p === "/api/auth/me")
    return json({
      user: { id: "synthetic-audit-owner", displayName: "Приёмка", username: null, photoUrl: null },
    });
  if (p === "/api/reminders/settings")
    return json({
      settings: {
        ownerId: "synthetic-audit-owner",
        enabled: false,
        timeZone: "Asia/Yekaterinburg",
        quietStart: "23:00",
        quietEnd: "08:00",
        nextEveningAt: null,
        eveningTime: "21:00",
      },
      deliveryIssues: 0,
    });
  if (p === "/api/progress/settings") {
    if (req.method() === "PUT") writes++;
    return json({ startsOn: "2026-10-06", revision: 0 });
  }
  if (p === "/api/reminders/progress-reports/preview") {
    if (mode === "preview-pending") await new Promise((resolve) => setTimeout(resolve, 450));
    if (mode === "preview-error")
      return json({ status: 503, title: "Synthetic preview error" }, 503);
    return json({ message: fixtures.report, reason: null, overview: fixtures.expanded });
  }
  if (p === "/api/reminders/progress-reports") {
    if (mode === "report-loading") await new Promise((resolve) => setTimeout(resolve, 450));
    if (mode === "report-error")
      return json({ status: 503, title: "Synthetic settings error" }, 503);
    if (req.method() === "PUT") {
      writes++;
      if (mode === "save-error") return json({ status: 503, title: "Synthetic save error" }, 503);
    }
    return json(state);
  }
  if (p === "/api/progress" || p.startsWith("/api/progress/goals/")) {
    if (mode === "error" || mode === "missing")
      return json(
        {
          status: mode === "error" ? 503 : 404,
          code: mode === "error" ? "UNAVAILABLE" : "NOT_FOUND",
          title: "Synthetic progress error",
        },
        mode === "error" ? 503 : 404,
      );
    if (mode === "loading") await new Promise((resolve) => setTimeout(resolve, 450));
    let data = structuredClone(
      u.searchParams.get("period") === "month" ? fixtures.month : fixtures.expanded,
    );
    if (mode === "empty") data = structuredClone(fixtures.empty);
    if (mode === "no-goals") data = { ...data, state: "no-goals", goals: [] };
    if (mode === "before-start" || mode === "future-start")
      data = { ...data, state: mode, actual: null, startsOn: "2026-12-12", goals: [] };
    if (p.includes("/goals/")) {
      if (p.endsWith("/unbounded")) data = overview([unboundedSource]);
      else data.goals = data.goals.filter((g) => g.id === p.split("/").at(-1));
    }
    return json(data);
  }
  unhandled.push(`${req.method()} ${p}`);
  return json({ status: 404 }, 404);
});
const page = await context.newPage();
page.on("pageerror", (error) => pageErrors.push(error.message));
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
async function progress(selectedMode = "ready", goal = "", query = "") {
  mode = selectedMode;
  await page.goto(
    `${origin}/plans/2026-10/progress?anchor=2026-10-21${goal ? `&goal=${goal}` : ""}${query}`,
  );
  if (selectedMode === "ready")
    await page
      .getByRole("heading", {
        name: goal ? detailedSources.find((g) => g.id === goal)!.title : "Прогресс",
        exact: true,
      })
      .waitFor();
  else await page.locator("h1").waitFor();
  if (selectedMode === "ready" && !query.includes("empty=1"))
    await page
      .getByRole("heading", { name: goal ? "Записи по дням" : "Активность по дням", exact: true })
      .waitFor();
}
async function reports(selectedMode = "ready") {
  mode = selectedMode;
  state = structuredClone(fixtures.reportState);
  await page.goto(`${origin}/plans/2026-10/reminders?tab=reports`);
  await page.getByRole("heading", { name: "Отчёты о прогрессе", exact: true }).waitFor();
  if (!["report-loading", "report-error"].includes(selectedMode))
    await page.getByLabel("Среда").waitFor();
}
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
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
    const before = writes;
    await page.getByRole("button", { name: /Учитываем с/ }).click();
    await page.getByLabel("Дата начала учёта").fill("2026-12-12");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    return writes - before;
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
      await page.getByRole("button", { name: "Снять все", exact: true }).click();
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
      mode = "ready";
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
      const before = writes;
      mode = "preview-pending";
      await page.getByRole("button", { name: "Показать предпросмотр", exact: true }).click();
      const pending = await page
        .getByRole("button", { name: "Формируем…", exact: true })
        .isDisabled();
      await page.getByRole("button", { name: "Показать предпросмотр", exact: true }).waitFor();
      mode = "preview-error";
      await page.getByRole("button", { name: "Показать предпросмотр", exact: true }).click();
      await page.getByRole("alert").waitFor();
      return [pending, await page.getByRole("alert").isVisible(), writes - before];
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
            !(await page.getByRole("heading", { name: "Записи по дням", exact: true }).isVisible())
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
    return (await page.getByRole("link", { name: /Все цели|К списку целей/ }).count()) > 0;
  });
  await check("B13", "№34, F16: редактор правил имеет явную отмену черновика", true, async () => {
    await progress("ready", "reading");
    await page.locator("summary").filter({ hasText: "Изменить правило" }).click();
    await page.getByLabel("Порог").fill("30");
    return (await page.getByRole("button", { name: "Отмена", exact: true }).count()) > 0;
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
        sourceCommit: "2e5598ddf63539ee09c617050e264925cd47ee63",
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
