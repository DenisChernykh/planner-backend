import { env } from "cloudflare:workers";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp } from "../src";
import { D1ReminderRepository } from "../src/modules/reminders/infrastructure/d1-reminder-repository";
import { sha256Base64Url } from "../src/platform/crypto/secure-values";

const origin = "http://localhost:8787";
const bindings = {
  ...env,
  APP_ORIGIN: origin,
  AUTH_MODE: "development",
  AUTH_SUCCESS_REDIRECT_URL: `${origin}/`,
  BUILD_REVISION: "local",
  TELEGRAM_BOT_MODE: "disabled",
} as unknown as CloudflareBindings;
const app = createApp();
const date = "2026-10-01";
afterEach(() => vi.useRealTimers());
let ownerId: string;

async function request(
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
  trusted = true,
) {
  const headers = new Headers();
  if (trusted && method !== "GET") headers.set("Origin", origin);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return app.request(
    `${origin}${path}`,
    { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
    bindings,
  );
}

async function issue() {
  const response = await request("/api/integrations/chatgpt", "POST", {});
  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  return (await response.json()) as { token: string; expiresAt: number };
}

async function goal(token: string, type = "quantity") {
  const response = await request(
    "/api/plans/2026-10/goals",
    "POST",
    {
      title: "Вода",
      tracking:
        type === "quantity"
          ? { type, targetValue: 2000, unit: "мл", comparison: "atLeast" }
          : { type },
      cadence: { period: "day" },
    },
    token,
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { goal: { id: string } }).goal.id;
}

beforeEach(async () => {
  vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM users"),
    env.DB.prepare("DELETE FROM planning_entry_commands"),
  ]);
  const response = await request("/api/auth/me");
  ownerId = ((await response.json()) as { user: { id: string } }).user.id;
});

it("stores only a hash, rotates/revokes the key and does not expose it in GET", async () => {
  const first = await issue();
  const row = await env.DB.prepare("SELECT token_hash FROM chatgpt_connections WHERE owner_id = ?")
    .bind(ownerId)
    .first<{ token_hash: string }>();
  expect(row?.token_hash).toBe(await sha256Base64Url(first.token));
  const state = await request("/api/integrations/chatgpt");
  expect(JSON.stringify(await state.json())).not.toContain(first.token);
  expect((await request("/api/auth/me", "GET", undefined, first.token)).status).toBe(200);
  const second = await issue();
  expect((await request("/api/auth/me", "GET", undefined, first.token)).status).toBe(401);
  expect((await request("/api/auth/me", "GET", undefined, second.token)).status).toBe(200);
  await env.DB.prepare("DELETE FROM sessions").run();
  expect((await request("/api/auth/me", "GET", undefined, second.token)).status).toBe(200);
  expect((await request("/api/integrations/chatgpt", "DELETE")).status).toBe(204);
  expect((await request("/api/auth/me", "GET", undefined, second.token)).status).toBe(401);
});

it("keeps web origin protection and denies credential management, notes and expired keys", async () => {
  const { token } = await issue();
  expect((await request("/api/integrations/chatgpt", "POST", {}, undefined, false)).status).toBe(
    403,
  );
  for (const method of ["GET", "POST", "DELETE"])
    expect(
      (
        await request(
          "/api/integrations/chatgpt",
          method,
          method === "POST" ? {} : undefined,
          token,
        )
      ).status,
    ).toBe(403);
  expect((await request("/api/notes", "GET", undefined, token)).status).toBe(403);
  expect((await request("/api/reminders/settings", "PUT", {}, token, false)).status).toBe(403);
  await env.DB.prepare("UPDATE chatgpt_connections SET expires_at = ?").bind(Date.now()).run();
  expect((await request("/api/auth/me", "GET", undefined, token)).status).toBe(401);
  expect((await request("/api/auth/me", "GET", undefined, "invalid")).status).toBe(401);
});

it("keeps owner boundaries for keys and prevents another account from revoking a connection", async () => {
  const { token } = await issue();
  const id = await goal(token);
  const otherOwner = crypto.randomUUID();
  const otherToken = `ritm_${"b".repeat(43)}`;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)").bind(
      otherOwner,
      Date.now(),
      Date.now(),
    ),
    env.DB.prepare(
      "INSERT INTO chatgpt_connections (owner_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(otherOwner, await sha256Base64Url(otherToken), Date.now(), Date.now() + 60_000),
  ]);
  expect((await request(`/api/goals/${id}`, "DELETE", undefined, otherToken)).status).toBe(404);
  expect(
    (
      await request(
        `/api/goals/${id}/entries/${date}/adjust`,
        "POST",
        { delta: 200, operationId: crypto.randomUUID() },
        otherToken,
      )
    ).status,
  ).toBe(404);
  const plan = await request("/api/plans/2026-10", "GET", undefined, otherToken);
  expect(((await plan.json()) as { goals: unknown[] }).goals).toEqual([]);
});

it("adds once across replays, preserves the note, accepts zero and validates goal type/date", async () => {
  const { token } = await issue();
  const id = await goal(token);
  const entryPath = `/api/goals/${id}/entries/${date}`;
  expect(
    (await request(entryPath, "PUT", { value: 900, note: "После прогулки" }, token)).status,
  ).toBe(200);
  const input = { delta: 200, operationId: crypto.randomUUID() };
  for (let count = 0; count < 2; count++) {
    const response = await request(`${entryPath}/adjust`, "POST", input, token);
    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { entry: { value: number; note: string } }).entry,
    ).toMatchObject({ value: 1100, note: "После прогулки" });
  }
  // Replaying the old command after a website edit must preserve the new total.
  await request(entryPath, "PUT", { value: 0, note: "Новый итог" }, token);
  const replay = await request(`${entryPath}/adjust`, "POST", input, token);
  expect(((await replay.json()) as { entry: { value: number } }).entry.value).toBe(0);
  const check = await goal(token, "check");
  expect(
    (await request(`/api/goals/${check}/entries/${date}/adjust`, "POST", input, token)).status,
  ).toBe(400);
  expect(
    (await request(`/api/goals/${id}/entries/2026-10-02/adjust`, "POST", input, token)).status,
  ).toBe(400);
  expect(
    (await request(`${entryPath}/adjust`, "POST", { delta: 1, operationId: "bad" }, token)).status,
  ).toBe(400);
});

it("concurrent additions never overwrite an already changed revision", async () => {
  const { token } = await issue();
  const id = await goal(token);
  const path = `/api/goals/${id}/entries/${date}/adjust`;
  const responses = await Promise.all([
    request(path, "POST", { delta: 200, operationId: crypto.randomUUID() }, token),
    request(path, "POST", { delta: 300, operationId: crypto.randomUUID() }, token),
  ]);
  const statuses = responses.map((response) => response.status);
  expect(statuses.every((status) => status === 200 || status === 409)).toBe(true);
  expect(statuses.filter((status) => status === 200).length).toBeGreaterThan(0);
  const plan = await request("/api/plans/2026-10", "GET", undefined, token);
  const entry = ((await plan.json()) as { goals: { entries: { value: number }[] }[] }).goals[0]
    ?.entries[0];
  const successfulTotal = responses.reduce(
    (total, response, index) => total + (response.status === 200 ? ([200, 300][index] ?? 0) : 0),
    0,
  );
  expect(entry?.value).toBe(successfulTotal);
});

it("retains addition receipts after cleanup and deletes them with the account", async () => {
  const { token } = await issue();
  const id = await goal(token);
  const path = `/api/goals/${id}/entries/${date}/adjust`;
  const input = { delta: 200, operationId: crypto.randomUUID() };
  expect((await request(path, "POST", input, token)).status).toBe(200);
  await env.DB.prepare(
    "INSERT INTO planning_entry_commands (id, result, created_at) VALUES ('old-reminder', 'saved', ?)",
  )
    .bind(Date.now())
    .run();
  vi.setSystemTime(Date.now() + 100 * 86_400_000);
  await new D1ReminderRepository(env.DB).recover(Date.now());
  expect(
    await env.DB.prepare(
      "SELECT id FROM planning_entry_commands WHERE id = 'old-reminder'",
    ).first(),
  ).toBeNull();
  const replay = await request(path, "POST", input, token);
  expect(replay.status).toBe(200);
  expect(((await replay.json()) as { entry: { value: number } }).entry.value).toBe(200);
  await request(`/api/goals/${id}/entries/${date}`, "DELETE", undefined, token);
  expect((await request(path, "POST", input, token)).status).toBe(409);
  expect(
    await env.DB.prepare("SELECT goal_id FROM goal_entries WHERE goal_id = ?").bind(id).first(),
  ).toBeNull();
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(ownerId).run();
  expect(await env.DB.prepare("SELECT id FROM planning_entry_commands").first()).toBeNull();
});
