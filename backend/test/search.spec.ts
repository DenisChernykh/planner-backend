import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src";
import type { SearchPage } from "../src/modules/planning/domain/search";
import { sha256Base64Url } from "../src/platform/crypto/secure-values";

const origin = "http://localhost:8787";
const bindings = {
  ...env,
  APP_ORIGIN: origin,
  AUTH_MODE: "development",
  AUTH_SUCCESS_REDIRECT_URL: `${origin}/`,
  TELEGRAM_BOT_MODE: "disabled",
} as unknown as CloudflareBindings;
const app = createApp();

function request(path: string, body?: unknown, method = "GET") {
  return app.request(
    `${origin}${path}`,
    {
      method,
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    bindings,
  );
}
async function goal(
  title = "Тренировка",
  month = "2026-09",
  overrides: Record<string, unknown> = {},
) {
  const response = await request(
    `/api/plans/${month}/goals`,
    {
      title,
      tracking: { type: "check" },
      cadence: { period: "day" },
      ...overrides,
    },
    "POST",
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { goal: { id: string; ownerId: string } }).goal;
}
async function entry(
  goalId: string,
  date: string,
  value: unknown = { completed: true, note: "Колено не болит" },
) {
  expect(
    (
      await request(
        `/api/goals/${goalId}/entries/${date}`,
        { ...(value as object), expectedRevision: null },
        "PUT",
      )
    ).status,
  ).toBe(200);
}
async function search(params: Record<string, string> = {}) {
  const response = await request(`/api/search?${new URLSearchParams(params)}`);
  expect(response.status).toBe(200);
  return (await response.json()) as SearchPage;
}
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM goal_entries"),
    env.DB.prepare("DELETE FROM plan_goals"),
    env.DB.prepare("DELETE FROM users"),
  ]);
  vi.setSystemTime(new Date("2026-10-07T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("global planning search", () => {
  it("searches Cyrillic without case or е/ё differences, ranks titles above descriptions and notes", async () => {
    const exact = await goal("Колено", "2026-08");
    const described = await goal("Растяжка", "2026-09", { description: "Беречь колено" });
    const training = await goal();
    await entry(training.id, "2026-09-25");
    const light = await goal("Лёгкая зарядка");
    const result = await search({ q: "КОЛЕНО" });
    expect(result.results.map((item) => item.kind)).toEqual(["goal", "goal", "entry"]);
    expect(result.results[0]?.goal.id).toBe(exact.id);
    expect(result.results[2]?.entry?.note).toBe("Колено не болит");
    expect(result.counts).toEqual({ goals: 2, entries: 1 });
    expect((await search({ q: "легк" })).results[0]?.goal.id).toBe(light.id);
    const missing = await search({
      q: "колено",
      presence: "missing",
      from: "2026-08-31",
      to: "2026-09-01",
    });
    expect(missing.results.map((item) => item.goal.id)).toEqual([exact.id, described.id]);
    expect(missing.results.map((item) => item.match)).toEqual(["title", "description"]);
  });

  it("filters a specific goal's numeric values, preserves zero, and keeps the date boundaries inclusive", async () => {
    const water = await goal("Вода", "2026-09", {
      tracking: { type: "quantity", unit: "мл", targetValue: 1500, comparison: "atLeast" },
    });
    const pages = await goal("Чтение", "2026-09", {
      tracking: { type: "quantity", unit: "стр", targetValue: 30, comparison: "atLeast" },
    });
    for (const [day, value] of [
      [28, 0],
      [29, 900],
      [30, 1500],
    ])
      await entry(water.id, `2026-09-${day}`, { value });
    await entry(pages.id, "2026-09-29", { value: 10 });
    const result = await search({
      goalId: water.id,
      comparison: "lt",
      value: "1200",
      from: "2026-09-28",
      to: "2026-09-29",
    });
    expect(result.results.map((item) => item.entry?.value)).toEqual([900, 0]);
    expect(result.results.every((item) => item.goal.id === water.id)).toBe(true);
    expect(
      (await search({ goalId: water.id, comparison: "between", value: "0", valueTo: "900" })).total,
    ).toBe(2);
  });

  it("distinguishes a missing day from a saved unmet entry and excludes future days in the account timezone", async () => {
    const created = await goal("Зарядка", "2026-10");
    await entry(created.id, "2026-10-06", { completed: false });
    await request(
      "/api/reminders/settings",
      {
        enabled: false,
        timeZone: "America/Los_Angeles",
        quietStart: "23:00",
        quietEnd: "08:00",
        eveningTime: "21:00",
      },
      "PUT",
    );
    vi.setSystemTime(new Date("2026-10-07T01:00:00Z"));
    const missing = await search({
      goalId: created.id,
      presence: "missing",
      from: "2026-10-05",
      to: "2026-10-08",
    });
    expect(missing.today).toBe("2026-10-06");
    expect(missing.results.map((item) => item.date)).toEqual(["2026-10-05"]);
    expect(missing.results[0]?.entry).toBeNull();
    const unmet = await search({ goalId: created.id, met: "unmet" });
    expect(unmet.results.map((item) => item.date)).toEqual(["2026-10-06"]);
    expect(unmet.results[0]?.entry?.value).toBe(false);
  });

  it("combines cadence, tracking, status and note filters, and compares time without parsing it as a number", async () => {
    const sleep = await goal("Подъём", "2026-09", {
      tracking: { type: "time", targetEnd: "09:00" },
      cadence: { period: "week", targetOccurrences: 4 },
    });
    await entry(sleep.id, "2026-09-25", { value: "08:45", note: "  " });
    await entry(sleep.id, "2026-09-26", { value: "09:30", note: "Поздно" });
    const result = await search({
      tracking: "time",
      cadence: "week",
      met: "met",
      note: "absent",
      goalId: sleep.id,
      comparison: "lt",
      value: "09:00",
    });
    expect(result.results.map((item) => item.entry?.value)).toEqual(["08:45"]);
    expect((await search({ goalId: sleep.id, note: "present" })).results[0]?.entry?.value).toBe(
      "09:30",
    );
  });

  it("includes trash only on request and never restores or duplicates the goal", async () => {
    const training = await goal();
    await entry(training.id, "2026-09-25");
    await request(`/api/goals/${training.id}`, undefined, "DELETE");
    expect((await search({ q: "колено" })).total).toBe(0);
    const deleted = await search({ q: "колено", includeDeleted: "true" });
    expect(deleted.total).toBe(1);
    expect(deleted.results[0]?.goal.deletedAt).not.toBeNull();
    const catalogue = await request("/api/search/goals?includeDeleted=true");
    expect(((await catalogue.json()) as { goals: unknown[] }).goals).toHaveLength(1);
    expect((await search({ q: "колено" })).total).toBe(0);
  });

  it("paginates deterministically and suggests a typo correction without replacing the query", async () => {
    const training = await goal();
    for (const day of [24, 25, 26]) await entry(training.id, `2026-09-${day}`);
    const first = await search({ q: "колено", limit: "2" });
    const second = await search({ q: "колено", limit: "2", offset: String(first.nextOffset) });
    expect(first.total).toBe(3);
    expect([...first.results, ...second.results].map((item) => item.date)).toEqual([
      "2026-09-26",
      "2026-09-25",
      "2026-09-24",
    ]);
    expect(second.nextOffset).toBeNull();
    const typo = await search({ q: "колнео" });
    expect(typo.total).toBe(0);
    expect(typo.suggestion).toBe("колено");
  });

  it.each<Record<string, string>>([
    { from: "2026-02-30" },
    { from: "2026-10-01", to: "2026-09-01" },
    { comparison: "lt", value: "12" },
    { presence: "missing", met: "unmet" },
    { presence: "missing", note: "present" },
    { limit: "101" },
    { includeDeleted: "yes" },
  ])("rejects invalid or incompatible filters: %j", async (params) => {
    const response = await request(`/api/search?${new URLSearchParams(params)}`);
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });

  it("requires authentication and scopes results, suggestions and goal choices to the owner", async () => {
    const other = await goal("Чужое колено");
    await entry(other.id, "2026-09-25");
    const ownerId = "22222222-2222-4222-8222-222222222222";
    const token = "search-test-session";
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)").bind(
        ownerId,
        Date.now(),
        Date.now(),
      ),
      env.DB.prepare(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      ).bind(await sha256Base64Url(token), ownerId, Date.now(), Date.now() + 60_000),
    ]);
    const authenticatedBindings = {
      ...bindings,
      AUTH_MODE: "telegram",
      AUTH_FLOW_SECRET: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      TELEGRAM_OIDC_CLIENT_ID: "123456789",
      TELEGRAM_OIDC_CLIENT_SECRET: "test-only-secret",
    } as CloudflareBindings;
    expect((await app.request(`${origin}/api/search`, {}, authenticatedBindings)).status).toBe(401);
    for (const path of [
      "/api/search?q=колено",
      "/api/search?q=колнео",
      `/api/search?goalId=${other.id}&includeDeleted=true`,
    ]) {
      const response = await app.request(
        `${origin}${path}`,
        { headers: { Cookie: `__Host-session=${token}` } },
        authenticatedBindings,
      );
      expect(response.status).toBe(200);
      const data = (await response.json()) as SearchPage;
      expect(data.results).toEqual([]);
      expect(data.suggestion).toBeNull();
    }
    const choices = await app.request(
      `${origin}/api/search/goals?includeDeleted=true`,
      { headers: { Cookie: `__Host-session=${token}` } },
      authenticatedBindings,
    );
    expect(await choices.json()).toEqual({ goals: [] });
  });
});
