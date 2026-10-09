// Render every screen and every state-board scenario against the real local UI.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHarness } from "./browser-harness.ts";
import { detailedSources, fixtures } from "./browser-fixtures.ts";
import type { ProgressSource } from "../../backend/src/modules/progress/domain/model.ts";
import { calculateMet } from "../../backend/src/modules/planning/domain/rules.ts";

const targets = JSON.parse(readFileSync(new URL("./capture-targets.json", import.meta.url), "utf8")).targets;
const frames = JSON.parse(readFileSync(new URL("../../frontend/docs/design/progress/frames.json", import.meta.url), "utf8")).frames.map((frame) => ({ ...frame, file: targets.find((target) => target.id === frame.id).render }));
const folder = new URL("./evidence/final/", import.meta.url);
mkdirSync(folder, { recursive: true });
const captures: { penFrame: string; file: string; viewport: unknown; state: string; dimensions: unknown; overflow: boolean }[] = [];
let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
let currentToday = "";
async function prepare(today: string, width = 1440, height = 1100) {
  if (today !== currentToday) {
    if (harness) await harness.browser.close();
    harness = await createHarness(today);
    currentToday = today;
  }
  const h = harness!;
  h.control.sources = structuredClone(detailedSources);
  h.control.startsOn = "2026-10-06";
  h.control.previewDate = null;
  h.control.mode = "ready";
  await h.page.setViewportSize({ width, height });
  return h;
}
async function capture(reference: string, file: string, state: string, locator?: unknown) {
  const h = harness!;
  await h.page.evaluate(() => document.fonts.ready);
  const dialogVisible = await h.page.getByRole("dialog").isVisible();
  const screenshot = await (locator ?? h.page).screenshot({ path: new URL(file, folder).pathname, fullPage: !locator && !dialogVisible, animations: "disabled" });
  const dimensions = { width: screenshot.readUInt32BE(16), height: screenshot.readUInt32BE(20) };
  const overflow = await h.overflow();
  captures.push({ penFrame: frames.find((frame) => frame.file === reference).id, file, state, viewport: h.page.viewportSize(), dimensions, overflow });
  if (!overflow || h.pageErrors.length || h.unhandled.length) throw new Error(`Invalid capture ${file}: ${JSON.stringify({ overflow, errors: h.pageErrors, unhandled: h.unhandled })}`);
  console.log(`CAPTURE ${file}`);
}
const base = [
  ["week-desktop.png", "2026-10-07", "", ""], ["week-mobile.png", "2026-10-07", "", ""],
  ["week-320.png", "2026-10-07", "", ""], ["month-desktop.png", "2026-10-21", "", "&period=month"],
  ["month-mobile.png", "2026-10-21", "", "&period=month"], ["month-320.png", "2026-10-21", "", "&period=month"],
  ["goal-desktop.png", "2026-10-07", "reading", ""], ["goal-mobile.png", "2026-10-07", "reading", ""],
  ["comparison-desktop.png", "2026-10-21", "reading", ""], ["comparison-mobile.png", "2026-10-21", "reading", ""],
  ["check-detail-desktop.png", "2026-10-21", "training", ""], ["check-detail-mobile.png", "2026-10-21", "training", ""],
  ["scale-detail-desktop.png", "2026-10-21", "mood", ""], ["scale-detail-mobile.png", "2026-10-21", "mood", ""],
  ["time-detail-desktop.png", "2026-10-21", "sleep", ""], ["time-detail-mobile.png", "2026-10-21", "sleep", ""],
] as const;
for (const [file, today, goal, query] of base) {
  const frame = frames.find((f) => f.file === file);
  const h = await prepare(today, frame.width, frame.height);
  await h.progress("ready", goal, query);
  await capture(file, file, `${today}; ${goal || "overview"}${query}`);
}
for (const [mode, reference] of [["loading", "loading"], ["error", "error"], ["no-goals", "goals"], ["empty", "entries"], ["before-start", "before"], ["future-start", "future"], ["missing", "missing"], ["ready", "filter"]] as const) {
  for (const device of ["desktop", "mobile"]) {
    const file = `state-${reference}-${device}.png`;
    const frame = frames.find((f) => f.file === file);
    const h = await prepare("2026-10-07", frame.width, frame.height);
    if (mode === "future-start") h.control.startsOn = "2026-10-12";
    if (mode === "no-goals") h.control.startsOn = null;
    await h.progress(mode, mode === "missing" ? "reading" : "", reference === "filter" ? "&empty=1" : "", mode === "before-start" ? "2026-09-28" : "2026-10-07");
    if (mode === "loading") await h.page.getByLabel("Загружаем статистику", { exact: true }).waitFor();
    else if (mode === "error" || mode === "missing") await h.page.getByRole("alert").waitFor();
    else if (mode === "empty") await h.page.getByRole("status").filter({ hasText: "пока нет записей" }).waitFor();
    else if (reference === "filter") await h.page.getByRole("heading", { name: "Фильтр не дал результатов" }).waitFor();
    else await h.page.getByRole("heading", { name: /В этом периоде пока нет целей|Период раньше начала|Учёт начнётся/ }).waitFor();
    await capture(file, file, mode);
  }
}
for (const file of ["start-date-desktop.png", "start-date-mobile.png", "start-date-320.png"]) {
  const frame = frames.find((f) => f.file === file);
  const h = await prepare("2026-10-07", frame.width, frame.height);
  await h.progress();
  await h.page.getByRole("button", { name: /Учитываем с/ }).click();
  await h.page.getByRole("dialog").waitFor();
  await capture(file, file, "date dialog; 2026-10-06");
}
for (const [name, mode, value] of [["null", "ready", ""], ["future", "ready", "2026-12-12"], ["invalid", "ready", "2026-02-29"], ["pending", "date-pending", "2026-10-07"], ["error", "date-error", "2026-10-07"], ["success", "ready", "2026-10-07"]] as const) {
  const h = await prepare("2026-10-07", 390, 900);
  await h.progress();
  await h.page.getByRole("button", { name: /Учитываем с/ }).click();
  await h.page.getByLabel("Дата начала учёта").fill(value);
  h.control.mode = mode;
  if (["pending", "error", "success"].includes(name)) {
    await h.page.getByRole("button", { name: "Сохранить", exact: true }).click();
    if (name === "pending") await h.page.getByRole("button", { name: "Сохраняем…", exact: true }).waitFor();
    else if (name === "error") await h.page.getByRole("alert").waitFor();
    else await h.page.getByText("Дата сохранена · статистика обновлена", { exact: true }).waitFor();
  }
  await capture("start-date-states.png", `date-${name}.png`, name);
}
const enabled = { ...fixtures.reportState, settings: { ...fixtures.reportState.settings, enabled: true }, state: "ready" };
for (const file of ["telegram-settings-desktop.png", "telegram-settings-mobile.png", "settings-320.png"]) {
  const frame = frames.find((f) => f.file === file);
  const h = await prepare("2026-10-07", frame.width, frame.height);
  await h.reports("ready", enabled);
  if (frame.width >= 768) {
    await h.page.getByRole("button", { name: "Показать предпросмотр", exact: true }).click();
    await h.page.getByRole("heading", { name: "Ритм · Прогресс недели", exact: true }).waitFor();
  }
  await capture(file, file, "enabled; three selected goals; mobile preview opens separately");
}
for (const file of ["reminders-desktop.png", "reminders-mobile.png"]) {
  const frame = frames.find((f) => f.file === file);
  const h = await prepare("2026-10-07", frame.width, frame.height);
  await h.reports("ready", enabled);
  await h.page.goto("http://127.0.0.1:5188/plans/2026-10/reminders");
  await h.page.getByRole("switch", { name: "Отчёты о прогрессе", exact: true }).waitFor();
  await capture(file, file, "independent question/report modes");
}
for (const name of ["loading", "load-error", "disabled", "disconnected", "bot-unavailable", "no-goals", "future-start", "invalid-date", "invalid-time", "saving", "save-error", "saved", "preview-pending", "preview-error", "retrying", "unknown", "failed"]) {
  const h = await prepare("2026-10-07", 390, 900);
  let state = structuredClone(enabled);
  let mode = "ready";
  if (name === "loading") mode = "report-loading";
  if (name === "load-error") mode = "report-error";
  if (name === "disabled") state.settings.enabled = false;
  if (name === "disconnected") state.connection = "disconnected";
  if (name === "bot-unavailable") state.botAvailable = false;
  if (name === "no-goals") { state.goals = []; state.state = "no-goals"; }
  if (name === "future-start") { state.startsOn = "2026-10-12"; state.state = "future-start"; }
  if (["retrying", "unknown", "failed"].includes(name)) state.delivery[name] = 1;
  await h.reports(mode, state);
  if (name === "load-error") await h.page.getByRole("alert").waitFor();
  if (name === "invalid-date") await h.page.getByLabel("Учитывать прогресс с").fill("2026-02-29");
  if (name === "invalid-time") await h.page.getByLabel("Среда").fill("");
  if (["saving", "save-error", "saved"].includes(name)) {
    h.control.mode = name === "saving" ? "save-pending" : name === "save-error" ? "save-error" : "ready";
    await h.page.getByRole("button", { name: "Сохранить настройки отчётов", exact: true }).click();
    if (name === "saving") await h.page.getByRole("button", { name: "Сохраняем…", exact: true }).waitFor();
    else if (name === "save-error") await h.page.getByRole("alert").waitFor();
    else await h.page.getByText("Настройки отчётов сохранены", { exact: true }).waitFor();
  }
  if (["preview-pending", "preview-error"].includes(name)) {
    await h.page.getByRole("button", { name: "Предпросмотр отчёта", exact: true }).click();
    h.control.mode = name;
    await h.page.getByRole("button", { name: "Показать предпросмотр", exact: true }).click();
    if (name === "preview-pending") await h.page.getByRole("button", { name: "Формируем…", exact: true }).waitFor();
    else await h.page.getByRole("alert").waitFor();
  }
  await capture("telegram-settings-states.png", `report-${name}.png`, name);
}
for (const [name, search] of [["search", "Чтение"], ["no-result", "Такого названия нет"], ["all", ""], ["empty", ""]] as const) {
  const h = await prepare("2026-10-07", 390, 900);
  await h.reports("ready", enabled);
  await h.page.getByLabel("Поиск целей для отчёта").fill(search);
  if (name === "all") await h.page.getByRole("button", { name: "Выбрать все", exact: true }).click();
  if (name === "empty") await h.page.getByRole("button", { name: "Снять все", exact: true }).click();
  await capture("goal-selection-states.png", `selection-${name}.png`, name);
}
for (const width of [390, 1440]) {
  const h = await prepare("2026-10-07", width, 900);
  await h.progress();
  await h.page.getByRole("button", { name: "Все цели", exact: true }).click();
  await h.page.getByRole("dialog").waitFor();
  await capture(width === 390 ? "goal-filter-mobile.png" : "interaction-states.png", `filter-${width}.png`, "filter open");
}
for (const name of ["rule-draft", "rule-error", "rule-saving", "rule-cancelled"]) {
  const h = await prepare("2026-10-07", 390, 900);
  await h.progress("ready", "reading");
  await h.page.locator("summary").click();
  await h.page.getByLabel("Порог").fill("30");
  if (name === "rule-error" || name === "rule-saving") {
    h.control.mode = name === "rule-error" ? "rule-error" : "rule-pending";
    await h.page.getByRole("button", { name: "Сохранить и пересчитать" }).click();
    if (name === "rule-error") await h.page.getByRole("alert").waitFor();
    else await h.page.getByRole("button", { name: "Пересчитываем…" }).waitFor();
  }
  if (name === "rule-cancelled") {
    await h.page.getByRole("button", { name: "Отмена", exact: true }).click();
    await h.page.locator("summary").click();
  }
  await capture("interaction-states.png", `${name}.png`, name);
}
const variants = [
  ["quantity-at-most", { type: "quantity", comparison: "atMost", targetValue: 2, unit: "л" }, [0, 1.5, 3]],
  ["quantity-equal", { type: "quantity", comparison: "equal", targetValue: 10, unit: "ед." }, [10, 0, 9]],
  ["scale-ten", { type: "scale", min: 1, max: 10 }, [1, 7, 10]],
  ["time-lower", { type: "time", targetStart: "07:00" }, ["06:50", "07:10", "08:00"]],
  ["time-upper", { type: "time", targetEnd: "23:30" }, ["23:00", "23:50", "22:50"]],
  ["time-midnight", { type: "time", targetStart: "23:00", targetEnd: "01:00" }, ["23:50", "00:10", "12:00"]],
  ["time-unbounded", { type: "time" }, ["23:50", "00:10", "00:05"]],
  ["check-daily", { type: "check" }, [true, false, true]],
  ["monthly-plan", { type: "check" }, [true, false, true]],
] as const;
for (const [name, tracking, values] of variants) {
  const h = await prepare("2026-10-21", 390, 1000);
  const goal: ProgressSource = { id: "variant", chainId: "variant", month: "2026-10", title: "Любое название", tracking, cadence: name === "monthly-plan" ? { period: "month", targetOccurrences: 20 } : { period: "day" }, entries: values.map((value, index) => ({ date: `2026-10-${19 + index}`, value, met: calculateMet(tracking, value) })) };
  h.control.sources = [goal];
  await h.progress("ready", "variant");
  await capture("goal-rule-variants.png", `variant-${name}.png`, name);
}
// Board 27 is a set of calculation examples, each rendered as a real goal.
const boundaryCases = [
  ["month-comparison", "2026-12-21", "2026-10-06", [
    { month: "2026-11", count: 15, sum: 430 }, { month: "2026-12", count: 18, sum: 520 },
  ]],
] as const;
for (const [name, today, startsOn, months] of boundaryCases) {
  const h = await prepare(today, 1440, 1100);
  h.control.startsOn = startsOn;
  h.control.sources = months.map(({ month, count, sum }) => ({
    id: month, chainId: "monthly-comparison", month, title: "Любая количественная цель",
    tracking: { type: "quantity", comparison: "atLeast", targetValue: 20, unit: "страниц" }, cadence: { period: "day" },
    entries: Array.from({ length: 21 }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, "0")}`, value: i === 0 ? sum - (count - 1) * 20 : i < count ? 20 : 0, met: i < count })),
  }));
  await h.page.goto(`http://127.0.0.1:5188/plans/2026-12/progress?period=month&anchor=${today}&goal=2026-12`);
  await h.page.getByText("+14 п. п. к прошлому периоду", { exact: true }).waitFor();
  await capture("comparison-boundary-states.png", `boundary-${name}.png`, name);
}
for (const name of ["different-rules", "missing-neighbor", "streak-no-today", "streak-false-today", "streak-two-missing"]) {
  const today = name === "different-rules" ? "2026-10-04" : name === "missing-neighbor" ? "2026-10-28" : "2026-10-21";
  const h = await prepare(today, 390, 1000);
  const baseGoal: ProgressSource = { id: "variant", chainId: "boundary", month: "2026-10", title: "Любое название", tracking: { type: "check" }, cadence: { period: "day" }, entries: [] };
  if (name === "different-rules") {
    h.control.startsOn = null;
    h.control.sources = ["2026-09", "2026-10"].map((month) => ({ ...baseGoal, id: month, month, tracking: { type: "quantity", comparison: "atLeast", targetValue: month.endsWith("09") ? 20 : 30, unit: "страниц" }, entries: [{ date: `${month}-${month.endsWith("09") ? "28" : "01"}`, value: 30, met: true }] }));
    await h.page.goto(`http://127.0.0.1:5188/plans/2026-10/progress?anchor=${today}`);
    await h.page.getByRole("heading", { name: "Цели 2" }).waitFor();
  } else {
    h.control.sources = [{ ...baseGoal, cadence: name === "missing-neighbor" ? { period: "week", targetOccurrences: 3 } : { period: "day" }, entries: name === "missing-neighbor" ? [{ date: "2026-10-27", value: true, met: true }] : [{ date: "2026-10-19", value: true, met: true }, ...(name === "streak-two-missing" ? [] : [{ date: "2026-10-20", value: true, met: true }]), ...(name === "streak-false-today" ? [{ date: today, value: false, met: false }] : [])] }];
    await h.progress("ready", "variant");
  }
  await capture("comparison-boundary-states.png", `boundary-${name}.png`, name);
}
for (const [file, today, flavor] of [["telegram-message.png", "2026-10-07", "wed"], ["telegram-sunday.png", "2026-10-11", "sun"], ["telegram-no-entries.png", "2026-10-07", "empty"], ["telegram-truncated.png", "2026-10-07", "long"], ["telegram-delayed.png", "2026-10-12", "quiet"], ["telegram-goal-types.png", "2026-10-21", "types"]] as const) {
  const h = await prepare(today, 390, 1100);
  let state = structuredClone(enabled);
  if (flavor === "empty") h.control.sources = h.control.sources.map((goal) => ({ ...goal, entries: [] }));
  if (flavor === "long") {
    h.control.sources = Array.from({ length: 30 }, (_, i) => ({ ...detailedSources[0], id: `long-${i}`, chainId: `long-${i}`, title: `Цель ${i + 1}: достаточно длинное название для проверки полного блока` }));
    state.goals = h.control.sources.map((goal) => ({ goalId: goal.id, title: goal.title, included: true }));
  }
  if (flavor === "types") state.goals = detailedSources.map((goal) => ({ goalId: goal.id, title: goal.title, included: ["unbounded", "mood", "sleep"].includes(goal.id) }));
  await h.reports("ready", state);
  await h.page.getByRole("button", { name: "Предпросмотр отчёта", exact: true }).click();
  if (["sun", "quiet"].includes(flavor)) await h.page.getByRole("button", { name: "Воскресенье", exact: true }).click();
  if (flavor === "quiet") { h.control.mode = "quiet-delayed"; h.control.previewDate = "2026-10-11"; }
  await h.page.getByRole("button", { name: "Показать предпросмотр", exact: true }).click();
  await h.page.getByRole("heading", { name: /Ритм · (Прогресс|Итоги) недели/ }).waitFor();
  const bubble = h.page.locator("div.rounded-2xl").filter({ has: h.page.getByRole("heading", { name: /Ритм · (Прогресс|Итоги) недели/ }) });
  // Export the entire preview component, including content below the dialog's scroll area.
  // This capture-only expansion is not a claim about the Telegram client's layout.
  await bubble.evaluate((element) => {
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      parent.style.maxHeight = "none";
      parent.style.height = "auto";
      parent.style.overflow = "visible";
      if (parent.getAttribute("role") === "dialog") {
        parent.style.position = "absolute";
        parent.style.top = "0";
        parent.style.bottom = "auto";
        parent.style.transform = "none";
      }
    }
  });
  await capture(file, file, `Full preview content of server formatter; ${flavor}; capture-only scroll expansion. Telegram client is external.`, bubble);
}
if (harness) await harness.browser.close();
writeFileSync(new URL("./evidence/design-captures.json", import.meta.url), JSON.stringify({ sourceRevision: process.env.ACCEPTANCE_REVISION ?? "working-tree: fix/progress-complete", method: "Local Chrome with synthetic, source-backed fixtures. No real Telegram client, D1, or production claim.", captures }, null, 2) + "\n");
