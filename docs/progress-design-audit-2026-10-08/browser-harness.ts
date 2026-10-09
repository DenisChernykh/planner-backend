// Local browser acceptance only. All API requests are intercepted on loopback.
import { calculateMet } from "../../backend/src/modules/planning/domain/rules.ts";
import type { ProgressSource } from "../../backend/src/modules/progress/domain/model.ts";
import { nextReportOccurrence } from "../../backend/src/modules/reminders/domain/progress-reports.ts";
import { reportMessage } from "../../backend/src/modules/reminders/application/reports/report-message.ts";
import { fixtures, overview, sources, unboundedSource } from "./browser-fixtures.ts";

export const origin = "http://127.0.0.1:5188";
export async function createHarness(initialToday = "2026-10-21") {
  const { chromium } = await import(process.argv[2] ?? "playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const control = {
    mode: "ready", writes: 0, startsOn: "2026-10-06" as string | null,
    today: initialToday, previewDate: null as string | null,
    sources: structuredClone([...sources, unboundedSource]) as ProgressSource[],
    state: structuredClone(fixtures.reportState),
    questionEnabled: false, authenticated: true,
    requests: [] as { method: string; path: string; body?: unknown }[],
  };
  const pageErrors: string[] = [], unhandled: string[] = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce" });
  await context.addInitScript({ content: `
    const NativeDate = Date;
    globalThis.qaToday = ${JSON.stringify(initialToday)};
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [NativeDate.parse(globalThis.qaToday + "T16:00:00Z")])); }
      static now() { return NativeDate.parse(globalThis.qaToday + "T16:00:00Z"); }
    }
    globalThis.Date = FixedDate;
  ` });
  const pause = () => new Promise((resolve) => setTimeout(resolve, 900));
  const forecast = () => {
    const s = control.state;
    const selected = s.goals.some((goal) => goal.included);
    if (!s.settings.enabled || !selected || s.connection !== "active" || !s.botAvailable || (control.startsOn && control.startsOn > control.today)) {
      s.nextRuns = [];
      return;
    }
    const now = Date.parse(`${control.today}T16:00:00Z`);
    s.nextRuns = ([["wed", 3, s.settings.wednesdayTime], ["sun", 7, s.settings.sundayTime]] as const)
      .map(([slot, weekday, time]) => {
        const at = nextReportOccurrence(now, s.timeZone, time, weekday);
        return { slot, scheduledAt: at, sendAt: at, reportDate: new Intl.DateTimeFormat("sv-SE", { timeZone: s.timeZone }).format(at) };
      }).sort((a, b) => a.sendAt - b.sendAt) as typeof s.nextRuns;
  };
  const planGoal = (goal: ProgressSource) => ({
    ...goal, ownerId: "synthetic-audit-owner", description: null, deletedAt: null,
    createdAt: 0, updatedAt: 0,
    entries: goal.entries.map((entry) => ({ ...entry, note: "Сохранённая заметка", revision: "synthetic-revision", createdAt: 0, updatedAt: 0 })),
  });
  await context.route(`${origin}/api/**`, async (route) => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname;
    if (u.origin !== origin) throw new Error("Only loopback API calls are permitted");
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: status >= 400 ? "application/problem+json" : "application/json", body: JSON.stringify(body) });
    const body = req.method() === "GET" ? undefined : req.postDataJSON();
    control.requests.push({ method: req.method(), path: p, ...(body ? { body } : {}) });
    if (p === "/api/auth/me") return control.authenticated
      ? json({ user: { id: "synthetic-audit-owner", displayName: "Приёмка", username: null, photoUrl: null } })
      : json({ status: 401, code: "UNAUTHENTICATED", title: "Authentication required" }, 401);
    if (p === "/api/auth/config") return json({ botId: "synthetic-test-bot", available: false });
    if (!control.authenticated) return json({ status: 401, code: "UNAUTHENTICATED", title: "Authentication required" }, 401);
    if (p === "/api/reminders/settings") {
      if (req.method() === "PUT") {
        control.writes++;
        control.questionEnabled = body.enabled;
      }
      return json({ settings: { ownerId: "synthetic-audit-owner", enabled: control.questionEnabled, timeZone: "Asia/Yekaterinburg", quietStart: "23:00", quietEnd: "08:00", nextEveningAt: null, eveningTime: "21:00" }, connection: control.state.connection, botAvailable: control.state.botAvailable, deliveryIssues: 0 });
    }
    if (p.startsWith("/api/reminders/goals/")) return json({ goals: sources.map((goal) => ({ goalId: goal.id, title: goal.title, mode: "auto", time: "20:00", weekdays: [1, 2, 3, 4, 5, 6, 7], nextRunAt: null })) });
    if (p === "/api/progress/settings") {
      if (req.method() === "PUT") {
        control.writes++;
        if (control.mode === "date-pending") await pause();
        if (control.mode === "date-error") return json({ status: 503, title: "Synthetic date error" }, 503);
        control.startsOn = body.startsOn;
        control.state.startsOn = body.startsOn;
      }
      return json({ startsOn: control.startsOn, revision: control.writes });
    }
    if (p === "/api/reminders/progress-reports/preview") {
      if (control.mode === "preview-pending") await pause();
      if (control.mode === "preview-error") return json({ status: 503, title: "Synthetic preview error" }, 503);
      const selected = new Set(body.goals.filter((goal) => goal.included).map((goal) => goal.goalId));
      const date = control.previewDate ?? control.today;
      const data = overview(control.sources.filter((goal) => selected.has(goal.id)), "week", { today: date, startsOn: body.startsOn });
      const message = reportMessage(data, body.slot, origin, control.mode === "quiet-delayed" ? { scheduledAt: Date.parse(`${date}T18:30:00Z`), quietDelayed: true } : undefined);
      return json({ message, reason: data.state === "future-start" ? "future-start" : selected.size ? null : "no-goals", overview: data });
    }
    if (p === "/api/reminders/progress-reports") {
      if (control.mode === "report-loading") await pause();
      if (control.mode === "report-error") return json({ status: 503, title: "Synthetic settings error" }, 503);
      if (req.method() === "PUT") {
        control.writes++;
        if (control.mode === "save-pending") await pause();
        if (control.mode === "save-error") return json({ status: 503, title: "Synthetic save error" }, 503);
        control.state.settings = { ...control.state.settings, enabled: body.enabled, wednesdayTime: body.wednesdayTime, sundayTime: body.sundayTime, revision: control.writes };
        control.state.goals = control.state.goals.map((goal) => ({ ...goal, included: body.goals.find((item) => item.goalId === goal.goalId)?.included ?? false }));
        control.startsOn = body.startsOn;
        control.state.startsOn = body.startsOn;
        control.state.state = !body.enabled ? "disabled" : !body.goals.some((goal) => goal.included) ? "no-goals" : "ready";
        forecast();
      }
      return json(control.state);
    }
    if (p.startsWith("/api/goals/")) {
      const goal = control.sources.find((item) => item.id === p.split("/")[3]);
      if (!goal) return json({ status: 404 }, 404);
      if (req.method() === "PATCH") {
        control.writes++;
        if (control.mode === "rule-pending") await pause();
        if (control.mode === "rule-error") return json({ status: 503, title: "Synthetic rule error" }, 503);
        goal.tracking = body.tracking;
        goal.cadence = body.cadence;
        goal.entries = goal.entries.map((entry) => ({ ...entry, met: calculateMet(goal.tracking, entry.value) }));
      }
      return json(planGoal(goal));
    }
    if (p.startsWith("/api/plans/")) return json({ month: p.split("/").at(-1), today: control.today, goals: control.sources.filter((goal) => goal.month === p.split("/").at(-1) && goal.id !== "unbounded").map(planGoal) });
    if (p === "/api/progress" || p.startsWith("/api/progress/goals/")) {
      if (control.mode === "error" || (control.mode === "missing" && p.startsWith("/api/progress/goals/"))) return json({ status: control.mode === "error" ? 503 : 404, code: control.mode === "error" ? "UNAVAILABLE" : "NOT_FOUND", title: "Synthetic progress error" }, control.mode === "error" ? 503 : 404);
      if (control.mode === "loading") await pause();
      const period = u.searchParams.get("period") === "month" ? "month" : "week";
      let supplied = control.sources.filter((goal) => goal.id !== "unbounded");
      const detail = p.startsWith("/api/progress/goals/") ? p.split("/").at(-1) : null;
      if (detail === "unbounded") supplied = [control.sources.find((goal) => goal.id === "unbounded")!];
      if (u.searchParams.has("goals")) supplied = supplied.filter((goal) => u.searchParams.get("goals")!.split(",").includes(goal.id));
      if (control.mode === "empty") supplied = supplied.map((goal) => ({ ...goal, entries: [] }));
      let data = overview(supplied, period, { anchor: u.searchParams.get("anchor") ?? control.today, today: control.today, startsOn: control.startsOn });
      if (control.mode === "no-goals") data = { ...data, state: "no-goals", goals: [] };
      if (["before-start", "future-start"].includes(control.mode)) data = { ...data, state: control.mode as "before-start" | "future-start", actual: null, startsOn: control.mode === "future-start" && (!control.startsOn || control.startsOn <= control.today) ? "2026-12-12" : control.startsOn, goals: [] };
      if (detail) data.goals = data.goals.filter((goal) => goal.goalIds.includes(detail));
      return json(data);
    }
    unhandled.push(`${req.method()} ${p}`);
    return json({ status: 404 }, 404);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  async function progress(selectedMode = "ready", goal = "", query = "", anchor = selectedMode === "before-start" ? "2026-09-28" : control.today) {
    control.mode = selectedMode;
    await page.goto(`${origin}/plans/2026-10/progress?anchor=${anchor}${goal ? `&goal=${goal}` : ""}${query}`);
    await page.evaluate((today) => { globalThis.qaToday = today; }, control.today);
    await page.locator("h1").waitFor();
    if (selectedMode === "ready" && !query.includes("empty=1")) {
      await page.getByRole("heading", { name: goal ? /Записи (по дням|за период|и прошлый период)/ : "Активность по дням", exact: true }).waitFor();
    }
  }
  async function reports(selectedMode = "ready", reportState = fixtures.reportState) {
    control.mode = selectedMode;
    control.state = structuredClone(reportState);
    control.startsOn = reportState.startsOn;
    forecast();
    await page.goto(`${origin}/plans/2026-10/reminders?tab=reports`);
    await page.evaluate((today) => { globalThis.qaToday = today; }, control.today);
    await page.getByRole("heading", { name: /^Отчёты (о прогрессе|в Telegram)$/u }).waitFor();
    if (!["report-loading", "report-error"].includes(selectedMode)) await page.getByLabel("Среда").waitFor();
  }
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  return { browser, context, page, control, pageErrors, unhandled, progress, reports, overflow };
}
