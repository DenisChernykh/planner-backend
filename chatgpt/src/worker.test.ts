import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { type TestContext, test } from "node:test";
import { transformSync } from "esbuild";

const ui = await readFile("dist/ui.html", "utf8");

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PLANNER_ORIGIN, type PlannerFetch, type SiteEnvironment } from "./planner-client.ts";
import { createGoalOutput, getPlanOutput, recordEntryOutput } from "./schemas.ts";
import { UI_MIME_TYPE, UI_URI } from "./ui.ts";
import { createWorker } from "./worker.ts";

const accountId = "00000000-0000-4000-8000-000000000001";
const goalId = "00000000-0000-4000-8000-000000000002";
const date = "2026-10-01";
const owner = "owner@example.test";
const environment = {
  RITM_API_TOKEN: `ritm_${"a".repeat(43)}`,
  RITM_OWNER_EMAIL: owner,
  RITM_ACCOUNT_ID: accountId,
};

test("rejects oversized requests before parsing or contacting the account", async (t) => {
  const { worker, requests } = fixture(t);
  const response = await worker.fetch(
    new Request("https://test.invalid/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "a".repeat(65_536) }),
    }),
    environment,
  );
  assert.equal(response.status, 413);
  assert.equal(requests.length, 0);
});

function fixture(t: TestContext, upstream?: PlannerFetch) {
  const requests: Request[] = [];
  let revision = 0;
  let savedEntry = {
    revision: "test-revision",
    date,
    value: 900 as number | boolean | string,
    met: false,
    note: null,
  };
  let settings = {
    ownerId: accountId,
    enabled: false,
    timeZone: "Asia/Yekaterinburg",
    quietStart: "23:00",
    quietEnd: "08:00",
    eveningTime: "21:00",
    nextEveningAt: null,
  };
  let reminder = {
    goalId,
    mode: "off",
    time: "09:00",
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    nextRunAt: null,
  };
  const goals = [
    {
      id: goalId,
      ownerId: accountId,
      month: "2026-10",
      title: "Вода",
      description: null,
      tracking: { type: "quantity", unit: "мл", targetValue: 2_000, comparison: "atLeast" },
      cadence: { period: "day" },
      entries: [savedEntry],
      deletedAt: null as number | null,
    },
  ];
  const worker = createWorker(async (request) => {
    requests.push(request);
    if (upstream) return upstream(request);
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/me")
      return Response.json({
        user: { id: accountId, displayName: "Владелец", username: null, photoUrl: null },
      });
    if (path === "/api/search/goals") return Response.json({ goals });
    if (path === "/api/search")
      return Response.json({
        results: [
          {
            id: `entry:${goalId}:${date}`,
            kind: "entry",
            goal: goals[0],
            date,
            entry: savedEntry,
            match: null,
          },
        ],
        total: 1,
        counts: { goals: 0, entries: 1 },
        nextOffset: null,
        suggestion: null,
        today: date,
      });
    if (path === "/api/reminders/settings") {
      if (request.method === "PUT") {
        settings = { ...settings, ...(await request.json()) };
        return Response.json(settings);
      }
      return Response.json({
        settings,
        connection: "disconnected",
        botAvailable: false,
        deliveryIssues: 0,
      });
    }
    if (path.startsWith("/api/reminders/goals/")) {
      if (request.method === "PUT") {
        reminder = { ...reminder, ...(await request.json()) };
        return Response.json(reminder);
      }
      return Response.json({ goals: [{ ...reminder, title: goals[0].title }] });
    }
    if (path === "/api/reminders/telegram/connect")
      return Response.json({ url: "https://t.me/fixture_bot?start=fixture", expiresAt: 123 });
    if (path === "/api/reminders/telegram") return new Response(null, { status: 204 });
    if (path.includes("/entries/")) {
      if (request.method === "DELETE") {
        if (new URL(request.url).searchParams.get("expectedRevision") !== savedEntry.revision)
          return Response.json(
            { title: "Conflict", status: 409, code: "ENTRY_CONFLICT" },
            { status: 409 },
          );
        goals[0].entries = [];
        return new Response(null, { status: 204 });
      }
      const body = await request.clone().json();
      if (!path.endsWith("/adjust") && body.expectedRevision !== savedEntry.revision)
        return Response.json(
          { title: "Conflict", status: 409, code: "ENTRY_CONFLICT" },
          { status: 409 },
        );
      savedEntry = {
        ...savedEntry,
        revision: `test-revision-${++revision}`,
        value: path.endsWith("/adjust")
          ? Number(savedEntry.value) + body.delta
          : (body.value ?? body.completed),
      };
      goals[0].entries = [savedEntry];
      return Response.json({ entry: savedEntry });
    }
    if (request.method === "PATCH") {
      Object.assign(goals[0], await request.json());
      return Response.json({ goal: goals[0] });
    }
    if (request.method === "DELETE" || path.endsWith("/restore")) {
      goals[0].deletedAt = request.method === "DELETE" ? 123 : null;
      return new Response(null, { status: 204 });
    }
    if (path.endsWith("/order")) return new Response(null, { status: 204 });
    if (request.method === "POST") {
      const body = await request.clone().json();
      const created = {
        ...goals[0],
        ...body,
        id: "00000000-0000-4000-8000-000000000003",
        entries: [],
      };
      goals.push(created);
      return Response.json({ goal: created }, { status: 201 });
    }
    return Response.json({
      month: "2026-10",
      today: date,
      goals: goals.filter((goal) => Boolean(goal.deletedAt) === path.endsWith("/trash")),
    });
  }, ui);

  async function connect(email: string | null = owner, env: SiteEnvironment = environment) {
    const client = new Client({ name: "planner-test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("https://test.invalid/mcp"), {
      fetch: (input, init) => {
        const request = new Request(input, init);
        if (email) request.headers.set("oai-authenticated-user-email", email);
        return worker.fetch(request, env);
      },
    });
    t.after(() => client.close());
    await client.connect(transport);
    return client;
  }
  return { connect, requests, worker };
}

test("MCP discovers tools and public UI without contacting Planner or exposing a session", async (t) => {
  const { connect, requests } = fixture(t);
  const client = await connect(null, {});
  assert.equal(client.getServerVersion()?.name, "ritm");
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "get_account",
      "get_plan",
      "create_goal",
      "search_planner",
      "get_search_goals",
      "update_goal",
      "record_entry",
      "adjust_entry",
      "delete_entry",
      "delete_goal",
      "get_trash",
      "restore_goal",
      "reorder_goals",
      "get_reminder_settings",
      "save_reminder_settings",
      "get_goal_reminders",
      "save_goal_reminder",
      "connect_telegram",
      "disconnect_telegram",
      "open_ritm",
    ],
  );
  assert.equal(tools[0].annotations?.readOnlyHint, true);
  assert.equal(
    tools.find((tool) => tool.name === "record_entry")?.annotations?.idempotentHint,
    true,
  );
  assert.equal(
    tools.find((tool) => tool.name === "record_entry")?.annotations?.destructiveHint,
    true,
  );
  assert.deepEqual(tools.find((tool) => tool.name === "open_ritm")?._meta?.ui, {
    resourceUri: UI_URI,
    visibility: ["model", "app"],
  });
  assert.deepEqual(tools.find((tool) => tool.name === "open_ritm")?._meta?.["openai/ui"], {
    entrypoints: [{ type: "global" }],
  });
  const { resources } = await client.listResources();
  assert.equal(resources[0].uri, UI_URI);
  const resource = (await client.readResource({ uri: UI_URI })).contents[0];
  assert.equal(resource.mimeType, UI_MIME_TYPE);
  assert.ok("text" in resource);
  const html = resource.text;
  assert.equal(html.includes(environment.RITM_API_TOKEN), false);
  assert.equal(html.includes(owner), false);
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/u)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => transformSync(script, { loader: "js", format: "esm" }));
  assert.deepEqual(resource._meta?.ui, {
    prefersBorder: false,
    csp: { connectDomains: [], resourceDomains: [] },
  });
  assert.equal(requests.length, 0);
});

test("the sidebar entrypoint reads the same saved Planner data and never writes", async (t) => {
  const { connect, requests } = fixture(t);
  const client = await connect();
  const result = await client.callTool({ name: "open_ritm", arguments: {} });
  const plan = getPlanOutput.parse(result.structuredContent);
  assert.equal(plan.today, date);
  assert.equal(plan.goals[0].entries[0].value, 900);
  assert.equal(requests.length, 3);
  assert.ok(requests.every((request) => request.method === "GET"));
  assert.match(new URL(requests[2].url).pathname, /^\/api\/plans\/\d{4}-\d{2}$/u);

  requests.length = 0;
  const other = await connect("other@example.test");
  const denied = await other.callTool({ name: "open_ritm", arguments: {} });
  assert.equal(denied.isError, true);
  assert.equal(requests.length, 0);
});

test("search passes encoded filters to the owner's API without any mutation", async (t) => {
  const { connect, requests } = fixture(t);
  const client = await connect();
  const result = await client.callTool({
    name: "search_planner",
    arguments: {
      query: {
        q: "колено & вода",
        goalId,
        comparison: "lt",
        value: "1200",
        includeDeleted: true,
        offset: 50,
      },
    },
  });
  assert.equal(result.isError, undefined);
  assert.ok(requests.every((request) => request.method === "GET"));
  const url = new URL(requests.at(-1)!.url);
  assert.equal(url.pathname, "/api/search");
  assert.equal(url.searchParams.get("q"), "колено & вода");
  assert.equal(url.searchParams.get("includeDeleted"), "true");
  assert.equal(url.searchParams.get("offset"), "50");
  const choices = await client.callTool({ name: "get_search_goals", arguments: { query: {} } });
  assert.equal(choices.isError, undefined);
  const tools = (await client.listTools()).tools;
  for (const name of ["search_planner", "get_search_goals"])
    assert.equal(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint, true);
});

test("revision-aware PUT replaces 900 with 200; stale retries conflict and a fresh client reads it", async (t) => {
  const { connect, requests } = fixture(t);
  const client = await connect();
  const initial = getPlanOutput.parse(
    (await client.callTool({ name: "get_plan", arguments: { month: "2026-10" } }))
      .structuredContent,
  );
  assert.equal(initial.accountId, accountId);
  assert.equal(initial.today, date);
  assert.equal(initial.goals[0].entries[0].value, 900);
  assert.equal(initial.goals[0].ownerId, accountId);

  let expectedRevision = initial.goals[0].entries[0].revision;
  for (let i = 0; i < 2; i++) {
    const result = await client.callTool({
      name: "record_entry",
      arguments: { goalId, date, entry: { value: 200, expectedRevision } },
    });
    assert.equal(recordEntryOutput.parse(result.structuredContent).entry.value, 200);
    expectedRevision = recordEntryOutput.parse(result.structuredContent).entry.revision;
  }
  const stale = await client.callTool({
    name: "record_entry",
    arguments: { goalId, date, entry: { value: 900, expectedRevision: "test-revision" } },
  });
  assert.equal(stale.isError, true);
  const freshClient = await connect();
  const saved = getPlanOutput.parse(
    (await freshClient.callTool({ name: "get_plan", arguments: { month: "2026-10" } }))
      .structuredContent,
  );
  assert.equal(saved.goals[0].entries[0].value, 200);
  const writes = requests.filter((request) => request.method === "PUT");
  assert.equal(writes.length, 3);
  for (const request of requests) {
    assert.equal(new URL(request.url).origin, PLANNER_ORIGIN);
    assert.equal(request.headers.get("Authorization"), `Bearer ${environment.RITM_API_TOKEN}`);
    assert.equal(request.headers.has("Cookie"), false);
    assert.equal(request.redirect, "manual");
    assert.equal(request.headers.has("Sec-Fetch-Site"), false);
  }
  assert.equal(writes[0].headers.get("Origin"), PLANNER_ORIGIN);
  assert.deepEqual(await writes[0].clone().json(), {
    value: 200,
    expectedRevision: "test-revision",
  });
});

test("check and time results use the existing Planner entry bodies", async (t) => {
  const { connect, requests } = fixture(t);
  const client = await connect();
  for (const entry of [
    { completed: true, expectedRevision: "test-revision" },
    { value: "10:30", expectedRevision: "test-revision-1" },
  ]) {
    const result = await client.callTool({
      name: "record_entry",
      arguments: { goalId, date, entry },
    });
    assert.equal(result.isError, undefined);
    assert.deepEqual(await requests.at(-1)?.clone().json(), entry);
  }
});

test("create_goal maps month to the URL and saves tracking and cadence", async (t) => {
  const { connect, requests } = fixture(t);
  const client = await connect();
  const body = {
    title: "Откликаться на вакансии",
    tracking: { type: "quantity", unit: "отклик", targetValue: 1, comparison: "atLeast" },
    cadence: { period: "day" },
  };
  const result = await client.callTool({
    name: "create_goal",
    arguments: { month: "2026-10", input: body },
  });
  assert.equal(createGoalOutput.parse(result.structuredContent).goal.title, body.title);
  const request = requests.at(-1);
  assert.equal(request?.url, `${PLANNER_ORIGIN}/api/plans/2026-10/goals`);
  assert.equal(request?.method, "POST");
  assert.equal(request?.headers.get("Origin"), PLANNER_ORIGIN);
  assert.deepEqual(await request?.clone().json(), body);
});

test("invalid dates, IDs, time and injected connection settings never reach Planner", async (t) => {
  const { connect, requests } = fixture(t);
  const client = await connect();
  for (const args of [
    { goalId: "../auth/logout", date, entry: { value: 200, expectedRevision: "test-revision" } },
    { goalId, date: "2026-02-30", entry: { value: 200, expectedRevision: "test-revision" } },
    { goalId, date, entry: { value: "10-30" } },
    {
      goalId,
      date,
      entry: { value: 200, expectedRevision: "test-revision" },
      url: "https://other.invalid",
    },
  ]) {
    const result = await client.callTool({ name: "record_entry", arguments: args });
    assert.equal(result.isError, true);
  }
  const result = await client.callTool({ name: "get_plan", arguments: { month: "2026-13" } });
  assert.equal(result.isError, true);
  assert.equal(requests.length, 0);
});

test("editing, addition, trash and restore round-trip through the public tools", async (t) => {
  const { connect, requests } = fixture(t);
  const client = await connect();
  async function call(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, undefined, JSON.stringify(result));
    return result.structuredContent;
  }
  const input = { title: "Пить воду", description: null };
  assert.equal(
    createGoalOutput.parse(await call("update_goal", { goalId, input })).goal.title,
    input.title,
  );
  const operationId = crypto.randomUUID();
  const added = recordEntryOutput.parse(
    await call("adjust_entry", { goalId, date, delta: 200, operationId }),
  );
  assert.equal(added.entry.value, 1100);
  assert.deepEqual(await requests.at(-1)?.clone().json(), { delta: 200, operationId });
  await call("reorder_goals", { month: "2026-10", input: { cadence: "day", goalIds: [goalId] } });
  await call("delete_goal", { goalId });
  assert.equal(getPlanOutput.parse(await call("get_plan", { month: "2026-10" })).goals.length, 0);
  const trash = (await call("get_trash", { month: "2026-10" })) as { goals: { id: string }[] };
  assert.equal(trash.goals[0].id, goalId);
  await call("restore_goal", { goalId });
  assert.equal(
    getPlanOutput.parse(await call("get_plan", { month: "2026-10" })).goals[0].entries[0].value,
    1100,
  );
  await call("delete_entry", { goalId, date, expectedRevision: added.entry.revision });
  assert.equal(
    getPlanOutput.parse(await call("get_plan", { month: "2026-10" })).goals[0].entries.length,
    0,
  );
  assert.ok(
    requests
      .filter((request) => request.method !== "GET")
      .every((request) => request.headers.get("Origin") === PLANNER_ORIGIN),
  );
});

test("reminder tools preserve settings and schedule response shapes", async (t) => {
  const { connect } = fixture(t);
  const client = await connect();
  async function call(name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, undefined, JSON.stringify(result));
    return result.structuredContent as Record<string, unknown>;
  }
  const input = {
    enabled: true,
    timeZone: "Europe/Moscow",
    quietStart: "22:00",
    quietEnd: "07:00",
    eveningTime: "20:00",
  };
  assert.deepEqual(await call("save_reminder_settings", { input }), {
    ...input,
    ownerId: accountId,
    nextEveningAt: null,
  });
  assert.deepEqual((await call("get_reminder_settings")).settings, {
    ...input,
    ownerId: accountId,
    nextEveningAt: null,
  });
  const schedule = { mode: "scheduled", time: "10:00", weekdays: [1, 3, 5] };
  assert.deepEqual(await call("save_goal_reminder", { goalId, input: schedule }), {
    ...schedule,
    goalId,
    nextRunAt: null,
  });
  assert.deepEqual((await call("get_goal_reminders", { month: "2026-10" })).goals, [
    { ...schedule, goalId, nextRunAt: null, title: "Вода" },
  ]);
  assert.match(String((await call("connect_telegram")).url), /^https:\/\/t\.me\//u);
  assert.deepEqual(await call("disconnect_telegram"), { success: true });
});

test("missing configuration or a different visitor cannot use the owner session", async (t) => {
  const { connect, requests } = fixture(t);
  for (const client of [
    await connect(null),
    await connect("other@example.test"),
    await connect(owner, {}),
  ]) {
    const result = await client.callTool({ name: "get_plan", arguments: { month: "2026-10" } });
    assert.equal(result.isError, true);
    assert.equal(JSON.stringify(result).includes(environment.RITM_API_TOKEN), false);
  }
  assert.equal(requests.length, 0);
});

test("a key for a different account cannot read plans or write data", async (t) => {
  const { connect, requests } = fixture(t);
  const client = await connect(owner, {
    ...environment,
    RITM_ACCOUNT_ID: "00000000-0000-4000-8000-000000000099",
  });
  for (const name of ["get_plan", "create_goal"]) {
    const result = await client.callTool({
      name,
      arguments:
        name === "get_plan"
          ? { month: "2026-10" }
          : {
              month: "2026-10",
              input: { title: "Прогулка", tracking: { type: "check" }, cadence: { period: "day" } },
            },
    });
    assert.equal(result.isError, true);
    assert.deepEqual(result._meta?.apiError, { status: 403, code: "ACCOUNT_MISMATCH" });
  }
  assert.equal(requests.length, 2);
  assert.ok(
    requests.every(
      (request) => request.method === "GET" && new URL(request.url).pathname === "/api/auth/me",
    ),
  );
});

test("401 stops before any write and does not expose the upstream response", async (t) => {
  const { connect, requests } = fixture(
    t,
    async () => new Response("fixture-session", { status: 401 }),
  );
  const client = await connect();
  const result = await client.callTool({
    name: "record_entry",
    arguments: { goalId, date, entry: { completed: true, expectedRevision: "test-revision" } },
  });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result), /Создайте новый ключ/u);
  assert.equal(JSON.stringify(result).includes("fixture-session"), false);
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).pathname, "/api/auth/me");
});

test("a lost write response does not retry create_goal", async (t) => {
  const { connect, requests } = fixture(t, async (request) => {
    if (request.method === "GET")
      return Response.json({
        user: { id: accountId, displayName: "Владелец", username: null, photoUrl: null },
      });
    throw new Error("fixture-session");
  });
  const client = await connect();
  const result = await client.callTool({
    name: "create_goal",
    arguments: {
      month: "2026-10",
      input: { title: "Чтение", tracking: { type: "check" }, cadence: { period: "day" } },
    },
  });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result), /сначала перечитайте план/u);
  assert.equal(JSON.stringify(result).includes("fixture-session"), false);
  assert.equal(requests.filter((request) => request.method === "POST").length, 1);
  assert.equal(requests.length, 2);
});

test("redirects are errors and an unrelated browser Origin is rejected", async (t) => {
  const { connect, requests, worker } = fixture(
    t,
    async () => new Response(null, { status: 302, headers: { Location: "https://other.invalid" } }),
  );
  const client = await connect();
  const result = await client.callTool({ name: "get_plan", arguments: { month: "2026-10" } });
  assert.equal(result.isError, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].redirect, "manual");
  const response = await worker.fetch(
    new Request("https://test.invalid/mcp", { headers: { Origin: "https://other.invalid" } }),
    environment,
  );
  assert.equal(response.status, 403);
});
