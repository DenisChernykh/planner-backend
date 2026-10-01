import { type AxiosAdapter, AxiosError } from "axios";

type ToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: { type: string; text?: string }[];
  _meta?: Record<string, unknown>;
};
export type CallTool = (params: {
  name: string;
  arguments: Record<string, unknown>;
}) => Promise<ToolResult>;

const id = "([0-9a-f-]{36})";
const month = "(\\d{4}-\\d{2})";
const date = "(\\d{4}-\\d{2}-\\d{2})";
const routes = [
  ["GET", "/api/auth/me", "get_account", []],
  ["GET", `/api/plans/${month}`, "get_plan", ["month"]],
  ["GET", `/api/plans/${month}/trash`, "get_trash", ["month"]],
  ["POST", `/api/plans/${month}/goals`, "create_goal", ["month"]],
  ["PUT", `/api/plans/${month}/goals/order`, "reorder_goals", ["month"]],
  ["PATCH", `/api/goals/${id}`, "update_goal", ["goalId"]],
  ["DELETE", `/api/goals/${id}`, "delete_goal", ["goalId"]],
  ["POST", `/api/goals/${id}/restore`, "restore_goal", ["goalId"]],
  ["PUT", `/api/goals/${id}/entries/${date}`, "record_entry", ["goalId", "date"]],
  ["DELETE", `/api/goals/${id}/entries/${date}`, "delete_entry", ["goalId", "date"]],
  ["GET", "/api/reminders/settings", "get_reminder_settings", []],
  ["PUT", "/api/reminders/settings", "save_reminder_settings", []],
  ["GET", `/api/reminders/goals/${month}`, "get_goal_reminders", ["month"]],
  ["PUT", `/api/reminders/goals/${id}`, "save_goal_reminder", ["goalId"]],
  ["POST", "/api/reminders/telegram/connect", "connect_telegram", []],
  ["DELETE", "/api/reminders/telegram", "disconnect_telegram", []],
] as const;

/** Keeps the existing generated HTTP client and Query hooks in both runtimes. */
export function createChatGptAdapter(callTool: CallTool): AxiosAdapter {
  return async (config) => {
    if (config.signal?.aborted) throw new AxiosError("Запрос отменён.", "ERR_CANCELED", config);
    const method = config.method?.toUpperCase() ?? "GET";
    const route = routes.find(
      ([verb, path]) => verb === method && new RegExp(`^${path}$`, "iu").test(config.url ?? ""),
    );
    if (!route)
      throw new AxiosError("Это действие доступно в веб-версии Ритма.", "ERR_NOT_SUPPORT", config);
    const [, path, name, keys] = route;
    const match = new RegExp(`^${path}$`, "iu").exec(config.url ?? "");
    if (!match) throw new AxiosError("Некорректный запрос.", "ERR_BAD_REQUEST", config);
    const params: Record<string, unknown> = Object.fromEntries(
      keys.map((key, index) => [key, match[index + 1]]),
    );
    const body: unknown = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    if (body !== undefined) params[name === "record_entry" ? "entry" : "input"] = body;
    const result = await callTool({ name, arguments: params });
    const apiError = result._meta?.apiError as { status: number; code: string } | undefined;
    const response = {
      data: result.structuredContent,
      status: apiError?.status ?? 200,
      statusText: "",
      headers: {},
      config,
    };
    if (result.isError) {
      const message =
        result.content?.find((item) => item.type === "text")?.text ??
        "Не удалось выполнить запрос.";
      throw new AxiosError(message, "ERR_BAD_RESPONSE", config, undefined, {
        ...response,
        data: { code: apiError?.code ?? "DEPENDENCY_UNAVAILABLE", detail: message },
      });
    }
    return response;
  };
}
