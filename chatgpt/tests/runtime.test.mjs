import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { transformSync } from "esbuild";
import { Miniflare } from "miniflare";

test("built Sites Worker initializes, lists tools and reads Planner in workerd", async (t) => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const requests = [];
  const runtime = new Miniflare({
    workers: [
      {
        config: {
          name: "ritm",
          type: "worker",
          // Latest date supported by the workerd already pinned in this workspace.
          compatibilityDate: "2026-09-04",
          manifest: {
            mainModule: "index.js",
            modules: {
              "index.js": { type: "esm", contents: await readFile("dist/server/index.js", "utf8") },
            },
          },
          env: {
            RITM_API_TOKEN: { type: "json", value: `ritm_${"a".repeat(43)}` },
            RITM_OWNER_EMAIL: { type: "json", value: "owner@example.test" },
            RITM_ACCOUNT_ID: { type: "json", value: accountId },
          },
        },
        dev: {
          outboundService: {
            type: "fetcher",
            handler: async (request) => {
              requests.push(request.url);
              return Response.json(
                new URL(request.url).pathname === "/api/auth/me"
                  ? {
                      user: {
                        id: accountId,
                        displayName: "Владелец",
                        username: null,
                        photoUrl: null,
                      },
                    }
                  : { month: "2026-10", today: "2026-10-01", goals: [] },
              );
            },
          },
        },
      },
    ],
  });
  t.after(() => runtime.dispose());
  async function rpc(id, method, params) {
    const response = await runtime.dispatchFetch("https://test.invalid/mcp", {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-03-26",
        "oai-authenticated-user-email": "owner@example.test",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).result;
  }
  const init = await rpc(1, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "runtime-test", version: "1.0.0" },
  });
  assert.equal(init.serverInfo.name, "ritm");
  const { tools } = await rpc(2, "tools/list", {});
  assert.equal(tools.length, 18);
  for (const name of ["get_plan", "get_goal_reminders", "open_ritm"]) {
    const tool = tools.find((tool) => tool.name === name);
    assert.equal(tool.annotations.readOnlyHint, false, `${name} can prepare the current month`);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.annotations.idempotentHint, true);
  }
  for (const name of ["get_account", "get_trash", "get_reminder_settings"]) {
    assert.equal(tools.find((tool) => tool.name === name).annotations.readOnlyHint, true);
  }
  const { contents } = await rpc(3, "resources/read", { uri: "ui://ritm/app-v1.html" });
  assert.equal(contents[0].mimeType, "text/html;profile=mcp-app");
  assert.ok(contents[0].text.includes("Ритм"));
  assert.doesNotThrow(() =>
    transformSync(contents[0].text.match(/<script type="module">([\s\S]*?)<\/script>/u)[1], {
      loader: "js",
      format: "esm",
    }),
  );
  assert.deepEqual(requests, []);
  const plan = await rpc(4, "tools/call", { name: "get_plan", arguments: { month: "2026-10" } });
  assert.equal(plan.isError, undefined);
  assert.equal(plan.structuredContent.accountId, accountId);
  assert.deepEqual(requests, [
    "https://app.getplanner.workers.dev/api/auth/me",
    "https://app.getplanner.workers.dev/api/plans/2026-10",
  ]);
});
