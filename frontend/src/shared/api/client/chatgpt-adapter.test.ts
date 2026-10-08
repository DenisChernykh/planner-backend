import axios from "axios";
import { expect, it, vi } from "vitest";
import { getApiProblem } from "./api-problem";
import { createChatGptAdapter } from "./chatgpt-adapter";

const goalId = "00000000-0000-4000-8000-000000000002";

it("forwards search conditions and pagination to read-only tools", async () => {
  const call = vi.fn().mockResolvedValue({ structuredContent: { results: [] } });
  const client = axios.create({ adapter: createChatGptAdapter(call) });
  await client.get("/api/search", {
    params: {
      q: "колено",
      goalId,
      comparison: "lt",
      value: "1200",
      includeDeleted: "true",
      offset: 50,
    },
  });
  expect(call).toHaveBeenCalledWith({
    name: "search_planner",
    arguments: {
      query: {
        q: "колено",
        goalId,
        comparison: "lt",
        value: "1200",
        includeDeleted: true,
        offset: 50,
      },
    },
  });
  await client.get("/api/search/goals", { params: { includeDeleted: "false" } });
  expect(call).toHaveBeenLastCalledWith({
    name: "get_search_goals",
    arguments: { query: { includeDeleted: false } },
  });
});

it("runs generated HTTP calls through tools and preserves the original API response", async () => {
  const entry = { date: "2026-10-01", value: 0, note: "Заметка", met: false, revision: "next" };
  const call = vi.fn().mockResolvedValue({ structuredContent: { entry } });
  const client = axios.create({ adapter: createChatGptAdapter(call) });
  const response = await client.put(`/api/goals/${goalId}/entries/2026-10-01`, {
    value: 0,
    note: "Заметка",
    expectedRevision: "base",
  });
  expect(call).toHaveBeenCalledWith({
    name: "record_entry",
    arguments: {
      goalId,
      date: "2026-10-01",
      entry: { value: 0, note: "Заметка", expectedRevision: "base" },
    },
  });
  expect(response.data).toEqual({ entry });
  await client.delete(`/api/goals/${goalId}/entries/2026-10-01`, {
    params: { expectedRevision: "next" },
  });
  expect(call).toHaveBeenLastCalledWith({
    name: "delete_entry",
    arguments: { goalId, date: "2026-10-01", expectedRevision: "next" },
  });
  await client.patch(`/api/goals/${goalId}`, { description: null });
  expect(call).toHaveBeenLastCalledWith({
    name: "update_goal",
    arguments: { goalId, input: { description: null } },
  });
});

it("maps error results to the same Problem Details used by session handling", async () => {
  const call = vi.fn().mockResolvedValue({
    isError: true,
    content: [{ type: "text", text: "Ключ отозван" }],
    _meta: { apiError: { status: 401, code: "UNAUTHENTICATED" } },
  });
  const client = axios.create({ adapter: createChatGptAdapter(call) });
  const error = await client.get("/api/auth/me").catch((error) => error);
  expect(getApiProblem(error)).toEqual({ status: 401, code: "UNAUTHENTICATED" });
  expect(error.message).toBe("Ключ отозван");
  expect(call).toHaveBeenCalledTimes(1);
});

it("refuses unsupported and external routes and respects already cancelled requests", async () => {
  const call = vi.fn();
  const client = axios.create({ adapter: createChatGptAdapter(call) });
  for (const url of [
    "https://other.invalid/api/auth/me",
    "/api/integrations/chatgpt",
    "/api/auth/logout",
    "/api/goals/../auth/me",
  ])
    await expect(client.get(url)).rejects.toMatchObject({ code: "ERR_NOT_SUPPORT" });
  const controller = new AbortController();
  controller.abort();
  await expect(client.get("/api/auth/me", { signal: controller.signal })).rejects.toMatchObject({
    code: "ERR_CANCELED",
  });
  expect(call).not.toHaveBeenCalled();
});
