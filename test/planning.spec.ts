import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src";
import type { GoalRecord } from "../src/modules/planning/application/model";
import type { PlanningRepository } from "../src/modules/planning/application/ports";
import { calculateMet, ListPlan } from "../src/modules/planning/application/use-cases";
import { sha256Base64Url } from "../src/platform/crypto/secure-values";

const ORIGIN = "http://localhost:8787";
const PRODUCTION_ORIGIN = "https://free-hosting-starter.example.workers.dev";
const bindings = {
  ...env,
  APP_ORIGIN: ORIGIN,
  AUTH_MODE: "development",
  AUTH_SUCCESS_REDIRECT_URL: `${ORIGIN}/api/auth/me`,
  BUILD_REVISION: "local",
  TELEGRAM_BOT_MODE: "disabled",
} as unknown as CloudflareBindings;
const viteDevelopmentBindings = {
  ...bindings,
  APP_ORIGIN: "http://localhost:5173",
  AUTH_SUCCESS_REDIRECT_URL: "http://localhost:5173/",
} as unknown as CloudflareBindings;
const productionBindings = {
  ...env,
  APP_ORIGIN: PRODUCTION_ORIGIN,
  AUTH_FLOW_SECRET: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  AUTH_MODE: "telegram",
  AUTH_SUCCESS_REDIRECT_URL: `${PRODUCTION_ORIGIN}/api/auth/me`,
  BUILD_REVISION: "production",
  TELEGRAM_BOT_MODE: "disabled",
  TELEGRAM_OIDC_CLIENT_ID: "123456789",
  TELEGRAM_OIDC_CLIENT_SECRET: "test-only-secret",
} as unknown as CloudflareBindings;
const app = createApp();

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.method && !["GET", "HEAD"].includes(init.method)) {
    headers.set("Origin", ORIGIN);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return app.request(`${ORIGIN}${path}`, { ...init, headers }, bindings);
}

async function createGoal(input: Record<string, unknown> = {}) {
  const response = await request("/api/plans/2026-04/goals", {
    method: "POST",
    body: JSON.stringify({
      title: "Read",
      tracking: { type: "quantity", targetValue: 30, comparison: "atLeast", unit: "минут" },
      cadence: { period: "day" },
      ...input,
    }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as {
    goal: { id: string; tracking: GoalRecord["tracking"] };
  };
}

async function productionRequest(
  path: string,
  sessionToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Cookie", `__Host-session=${sessionToken}`);
  if (init.method && !["GET", "HEAD"].includes(init.method))
    headers.set("Origin", PRODUCTION_ORIGIN);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return app.request(`${PRODUCTION_ORIGIN}${path}`, { ...init, headers }, productionBindings);
}

async function insertSession(userId: string, sessionToken: string): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, display_name, username, photo_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(userId, userId, userId, null, now, now),
    env.DB.prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(await sha256Base64Url(sessionToken), userId, now, now + 86_400_000),
  ]);
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM goal_entries"),
    env.DB.prepare("DELETE FROM plan_goals"),
    env.DB.prepare("DELETE FROM notes"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM external_identities"),
    env.DB.prepare("DELETE FROM users"),
  ]);
  vi.setSystemTime(new Date("2026-04-15T10:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("planning application rules", () => {
  it("loads plan entries with one owner-scoped repository query instead of one query per goal", async () => {
    const goals: GoalRecord[] = [
      {
        id: "goal-a",
        ownerId: "owner-a",
        month: "2026-04",
        title: "A",
        description: null,
        tracking: { type: "check" },
        cadence: { period: "day" },
        deletedAt: null,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "goal-b",
        ownerId: "owner-a",
        month: "2026-04",
        title: "B",
        description: null,
        tracking: { type: "check" },
        cadence: { period: "day" },
        deletedAt: null,
        createdAt: 2,
        updatedAt: 2,
      },
    ];
    const listEntriesForPlan = vi.fn(async () => [
      {
        goalId: "goal-b",
        date: "2026-04-14",
        value: true,
        met: true,
        note: null,
        createdAt: 3,
        updatedAt: 3,
      },
    ]);
    const repository = {
      listGoals: vi.fn(async () => goals),
      listEntriesForPlan,
    } as unknown as PlanningRepository;

    await expect(new ListPlan(repository).execute("owner-a", "2026-04")).resolves.toEqual([
      { ...goals[0], entries: [] },
      {
        ...goals[1],
        entries: [
          {
            goalId: "goal-b",
            date: "2026-04-14",
            value: true,
            met: true,
            note: null,
            createdAt: 3,
            updatedAt: 3,
          },
        ],
      },
    ]);
    expect(listEntriesForPlan).toHaveBeenCalledOnce();
    expect(listEntriesForPlan).toHaveBeenCalledWith("owner-a", "2026-04", false);
  });

  it("calculates quantity, scale and every time-boundary variant", () => {
    expect(calculateMet({ type: "quantity", targetValue: 5, comparison: "atLeast" }, 5)).toBe(true);
    expect(calculateMet({ type: "quantity", targetValue: 5, comparison: "atMost" }, 6)).toBe(false);
    expect(calculateMet({ type: "quantity", targetValue: 5, comparison: "equal" }, 5)).toBe(true);
    expect(calculateMet({ type: "scale", min: 1, max: 10 }, 4)).toBe(true);
    expect(calculateMet({ type: "time" }, "12:00")).toBe(true);
    expect(calculateMet({ type: "time", targetStart: "08:00" }, "08:00")).toBe(true);
    expect(calculateMet({ type: "time", targetStart: "08:00" }, "07:59")).toBe(false);
    expect(calculateMet({ type: "time", targetEnd: "09:30" }, "09:30")).toBe(true);
    expect(calculateMet({ type: "time", targetEnd: "09:30" }, "09:31")).toBe(false);
    expect(calculateMet({ type: "time", targetStart: "21:00", targetEnd: "01:00" }, "23:00")).toBe(
      true,
    );
    expect(calculateMet({ type: "time", targetStart: "21:00", targetEnd: "01:00" }, "12:00")).toBe(
      false,
    );
  });

  it("creates virtual months and stores met with the raw value", async () => {
    const { goal } = await createGoal();
    const empty = await request("/api/plans/2026-05");
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ month: "2026-05", goals: [] });

    const entryResponse = await request(`/api/goals/${goal.id}/entries/2026-04-14`, {
      method: "PUT",
      body: JSON.stringify({ value: 10 }),
    });
    expect(entryResponse.status).toBe(200);
    expect(await entryResponse.json()).toMatchObject({
      entry: { date: "2026-04-14", value: 10, met: false, note: null },
    });

    const plan = await request("/api/plans/2026-04");
    expect(plan.status).toBe(200);
    expect(await plan.json()).toMatchObject({
      goals: [{ id: goal.id, entries: [{ date: "2026-04-14", value: 10, met: false }] }],
    });
  });

  it("publishes all Planning paths and their key OpenAPI contracts", async () => {
    const response = await request("/openapi.json");
    expect(response.status).toBe(200);
    const document = (await response.json()) as {
      components: { schemas: Record<string, unknown> };
      paths: Record<
        string,
        Record<string, { requestBody?: unknown; responses: Record<string, unknown> }>
      >;
    };
    const planningPaths = [
      "/api/plans/{month}",
      "/api/plans/{month}/goals",
      "/api/plans/{month}/trash",
      "/api/goals/{goalId}",
      "/api/goals/{goalId}/restore",
      "/api/goals/{goalId}/entries/{date}",
    ];
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(planningPaths));
    expect(Object.keys(document.paths["/api/plans/{month}"]?.get?.responses ?? {})).toEqual([
      "200",
      "400",
      "401",
      "404",
      "500",
    ]);
    expect(Object.keys(document.paths["/api/plans/{month}/goals"]?.post?.responses ?? {})).toEqual([
      "201",
      "400",
      "401",
      "403",
      "404",
      "413",
      "415",
      "500",
    ]);
    expect(Object.keys(document.paths["/api/goals/{goalId}"]?.patch?.responses ?? {})).toEqual([
      "200",
      "400",
      "401",
      "403",
      "404",
      "409",
      "413",
      "415",
      "500",
    ]);
    expect(
      Object.keys(document.paths["/api/goals/{goalId}/entries/{date}"]?.put?.responses ?? {}),
    ).toEqual(["200", "400", "401", "403", "404", "413", "415", "500"]);
    const createBody = document.paths["/api/plans/{month}/goals"]?.post?.requestBody;
    const entryBody = document.paths["/api/goals/{goalId}/entries/{date}"]?.put?.requestBody;
    expect(JSON.stringify(createBody)).toContain("application/json");
    expect(JSON.stringify(entryBody)).toContain("application/json");
    const createContract = JSON.stringify(createBody);
    const entryContract = JSON.stringify(entryBody);
    expect(createContract).toContain("targetOccurrences");
    expect(createContract).toContain("scale");
    expect(createContract).toContain("time");
    expect(entryContract).toContain("completed");
    expect(entryContract).toContain("value");
    expect(JSON.stringify(document.components.schemas)).toContain(
      "PlanningResourceNotFoundProblemDetails",
    );
  });

  it("accepts all four goal types and enforces type-specific values", async () => {
    const check = await createGoal({ title: "Done", tracking: { type: "check" } });
    const scale = await createGoal({ title: "Mood", tracking: { type: "scale", min: 1, max: 10 } });
    const time = await createGoal({
      title: "Sleep",
      tracking: { type: "time", targetStart: "21:00", targetEnd: "01:00" },
    });

    expect(
      (
        await request(`/api/goals/${check.goal.id}/entries/2026-04-15`, {
          method: "PUT",
          body: JSON.stringify({ completed: true }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(`/api/goals/${scale.goal.id}/entries/2026-04-15`, {
          method: "PUT",
          body: JSON.stringify({ value: 11 }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`/api/goals/${time.goal.id}/entries/2026-04-15`, {
          method: "PUT",
          body: JSON.stringify({ value: "23:15" }),
        })
      ).status,
    ).toBe(200);
    expect(
      await (
        await request(`/api/goals/${time.goal.id}/entries/2026-04-15`, {
          method: "PUT",
          body: JSON.stringify({ value: "12:00" }),
        })
      ).json(),
    ).toMatchObject({ entry: { met: false, value: "12:00" } });
  });

  it("creates time goals with independent bounds and evaluates their entries", async () => {
    const variants = [
      { title: "Any time", tracking: { type: "time" }, value: "12:00", met: true },
      {
        title: "Not before",
        tracking: { type: "time", targetStart: "08:00" },
        value: "07:59",
        met: false,
      },
      {
        title: "Not after",
        tracking: { type: "time", targetEnd: "09:30" },
        value: "09:31",
        met: false,
      },
      {
        title: "Overnight",
        tracking: { type: "time", targetStart: "21:00", targetEnd: "01:00" },
        value: "23:15",
        met: true,
      },
    ];

    for (const variant of variants) {
      const { goal } = await createGoal({ title: variant.title, tracking: variant.tracking });
      expect(goal.tracking).toEqual(variant.tracking);
      const response = await request(`/api/goals/${goal.id}/entries/2026-04-15`, {
        method: "PUT",
        body: JSON.stringify({ value: variant.value }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        entry: { value: variant.value, met: variant.met },
      });
    }
  });

  it("rejects weekly cadence above seven and monthly cadence above the actual month", async () => {
    const weekly = await request("/api/plans/2026-04/goals", {
      method: "POST",
      body: JSON.stringify({
        title: "Too many weekly repeats",
        tracking: { type: "check" },
        cadence: { period: "week", targetOccurrences: 8 },
      }),
    });
    expect(weekly.status).toBe(400);

    const april = await request("/api/plans/2026-04/goals", {
      method: "POST",
      body: JSON.stringify({
        title: "Too many April repeats",
        tracking: { type: "check" },
        cadence: { period: "month", targetOccurrences: 31 },
      }),
    });
    expect(april.status).toBe(400);

    const may = await request("/api/plans/2026-05/goals", {
      method: "POST",
      body: JSON.stringify({
        title: "Every day in May",
        tracking: { type: "check" },
        cadence: { period: "month", targetOccurrences: 31 },
      }),
    });
    expect(may.status).toBe(201);
  });

  it("rejects future and outside-month entries", async () => {
    const { goal } = await createGoal();
    const future = await request(`/api/goals/${goal.id}/entries/2026-04-16`, {
      method: "PUT",
      body: JSON.stringify({ value: 1 }),
    });
    expect(future.status).toBe(400);
    expect(await future.json()).toMatchObject({ code: "ENTRY_DATE_FUTURE" });

    const outside = await request(`/api/goals/${goal.id}/entries/2026-03-31`, {
      method: "PUT",
      body: JSON.stringify({ value: 1 }),
    });
    expect(outside.status).toBe(400);
    expect(await outside.json()).toMatchObject({ code: "ENTRY_DATE_INVALID" });
  });

  it("preserves old met after goal settings change and supports replace/delete", async () => {
    const { goal } = await createGoal();
    const first = await request(`/api/goals/${goal.id}/entries/2026-04-14`, {
      method: "PUT",
      body: JSON.stringify({ value: 10 }),
    });
    expect(first.status).toBe(200);
    const immutableType = await request(`/api/goals/${goal.id}`, {
      method: "PATCH",
      body: JSON.stringify({ tracking: { type: "scale", min: 1, max: 10 } }),
    });
    expect(immutableType.status).toBe(409);
    expect(await immutableType.json()).toMatchObject({ code: "GOAL_TYPE_IMMUTABLE" });
    const updated = await request(`/api/goals/${goal.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        tracking: { type: "quantity", targetValue: 5, comparison: "atLeast" },
      }),
    });
    expect(updated.status).toBe(200);
    const plan = await request("/api/plans/2026-04");
    expect(await plan.json()).toMatchObject({ goals: [{ entries: [{ value: 10, met: false }] }] });

    const replaced = await request(`/api/goals/${goal.id}/entries/2026-04-14`, {
      method: "PUT",
      body: JSON.stringify({ value: 10, note: "changed" }),
    });
    expect(await replaced.json()).toMatchObject({
      entry: { value: 10, met: true, note: "changed" },
    });
    expect(
      (await request(`/api/goals/${goal.id}/entries/2026-04-14`, { method: "DELETE" })).status,
    ).toBe(204);
  });

  it("updates only fields supplied by a goal PATCH and returns the stored row", async () => {
    const { goal } = await createGoal({
      title: "Original",
      description: "Keep this description",
      tracking: { type: "quantity", targetValue: 30, comparison: "atLeast", unit: "minutes" },
      cadence: { period: "week", targetOccurrences: 2 },
    });

    const response = await request(`/api/goals/${goal.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Renamed" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      goal: {
        id: goal.id,
        title: "Renamed",
        description: "Keep this description",
        tracking: { type: "quantity", targetValue: 30, comparison: "atLeast", unit: "minutes" },
        cadence: { period: "week", targetOccurrences: 2 },
      },
    });
  });

  it("moves goals to trash and restores them with history", async () => {
    const { goal } = await createGoal();
    await request(`/api/goals/${goal.id}/entries/2026-04-14`, {
      method: "PUT",
      body: JSON.stringify({ value: 30 }),
    });
    expect((await request(`/api/goals/${goal.id}`, { method: "DELETE" })).status).toBe(204);
    expect(await (await request("/api/plans/2026-04")).json()).toMatchObject({ goals: [] });
    expect(await (await request("/api/plans/2026-04/trash")).json()).toMatchObject({
      goals: [{ id: goal.id, entries: [{ value: 30 }] }],
    });
    expect((await request(`/api/goals/${goal.id}/restore`, { method: "POST" })).status).toBe(204);
    expect(await (await request("/api/plans/2026-04")).json()).toMatchObject({
      goals: [{ id: goal.id, entries: [{ value: 30 }] }],
    });
  });

  it("keeps goal resources owner-scoped and protects unsafe requests by Origin", async () => {
    const rejected = await app.request(
      `${ORIGIN}/api/plans/2026-04/goals`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
        body: JSON.stringify({
          title: "No",
          tracking: { type: "check" },
          cadence: { period: "day" },
        }),
      },
      bindings,
    );
    expect(rejected.status).toBe(403);

    const viteProxyRequest = await app.request(
      `${ORIGIN}/api/plans/2026-04/goals`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
        body: JSON.stringify({
          title: "Trusted through local Vite proxy",
          tracking: { type: "check" },
          cadence: { period: "day" },
        }),
      },
      viteDevelopmentBindings,
    );
    expect(viteProxyRequest.status).toBe(201);

    const weekly = await createGoal({
      title: "Exact cadence",
      cadence: { period: "week", targetOccurrences: 2 },
    });
    const weeklyPlan = await request("/api/plans/2026-04");
    const weeklyPlanBody = (await weeklyPlan.json()) as { goals: unknown[] };
    expect(weeklyPlanBody.goals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: weekly.goal.id,
          cadence: { period: "week", targetOccurrences: 2 },
        }),
      ]),
    );
    const invalidCadence = await request("/api/plans/2026-04/goals", {
      method: "POST",
      body: JSON.stringify({
        title: "Range is not supported",
        tracking: { type: "check" },
        cadence: { period: "week", targetOccurrences: 2, maxOccurrences: 3 },
      }),
    });
    expect(invalidCadence.status).toBe(400);

    const ownerA = "00000000-0000-0000-0000-00000000000a";
    const ownerB = "00000000-0000-0000-0000-00000000000b";
    await insertSession(ownerA, "owner-a-session");
    await insertSession(ownerB, "owner-b-session");
    const ownerAGoalResponse = await productionRequest(
      "/api/plans/2026-04/goals",
      "owner-a-session",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Owner A private",
          tracking: { type: "check" },
          cadence: { period: "day" },
        }),
      },
    );
    expect(ownerAGoalResponse.status).toBe(201);
    const ownerAGoal = (await ownerAGoalResponse.json()) as { goal: { id: string } };
    const ownerAEntry = await productionRequest(
      `/api/goals/${ownerAGoal.goal.id}/entries/2026-04-15`,
      "owner-a-session",
      { method: "PUT", body: JSON.stringify({ completed: true }) },
    );
    expect(ownerAEntry.status).toBe(200);
    const ownerBPlan = await productionRequest("/api/plans/2026-04", "owner-b-session");
    expect(await ownerBPlan.json()).toEqual({ month: "2026-04", goals: [] });
    const ownerBEntry = await productionRequest(
      `/api/goals/${ownerAGoal.goal.id}/entries/2026-04-15`,
      "owner-b-session",
      { method: "PUT", body: JSON.stringify({ completed: false }) },
    );
    expect(ownerBEntry.status).toBe(404);
    expect(await ownerBEntry.json()).toMatchObject({ code: "GOAL_NOT_FOUND" });
  });
});
