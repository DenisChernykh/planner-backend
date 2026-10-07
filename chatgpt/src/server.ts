import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  createPlannerClient,
  PlannerError,
  type PlannerFetch,
  requireOwnerToken,
  type SiteEnvironment,
} from "./planner-client.ts";
import {
  accountResponse,
  createGoalInput,
  createGoalOutput,
  entryIdInput,
  getPlanInput,
  getPlanOutput,
  goal,
  goalIdInput,
  goalPatch,
  month,
  planResponse,
  recordEntryInput,
  recordEntryOutput,
  reminderRule,
  reminderRuleInput,
  reminderSettingsInput,
  searchGoalsInput,
  searchGoalsOutput,
  searchInput,
  searchOutput,
  settingsResponse,
  success,
} from "./schemas.ts";
import { UI_MIME_TYPE, UI_URI } from "./ui.ts";

export const VERSION = "1.0.0";
const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
// Current-month reads can carry goals and reminder rules from the previous month.
const preparePlan = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const write = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};
const create = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
const visible = { ui: { visibility: ["model", "app"] } };
// Keep the background transparent for clients that render the icon as an alpha mask.
const icon = {
  src: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M7 17h4l3-8 5 15 3-7h3" fill="none" stroke="#4f46e5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')}`,
  mimeType: "image/svg+xml",
  sizes: ["any"],
};

export function createServer(
  request: Request,
  env: SiteEnvironment,
  fetchPlanner: PlannerFetch,
  ui: string,
) {
  const server = new McpServer(
    { name: "ritm", title: "Ритм — цели и привычки", version: VERSION, icons: [icon] },
    {
      capabilities: { extensions: { "io.modelcontextprotocol/ui": {} } },
      instructions:
        "Ритм — личные цели, привычки и результаты. Перед изменениями прочитай план. Используй ID целей и today из API, часовой пояс аккаунта, единицы из tracking. Для неоднозначной цели или значения уточни вопрос. record_entry заменяет результат полным итогом; adjust_entry прибавляет delta только для quantity. ‘Ещё 200 мл’ — прибавление, ‘за день 200 мл’ — итог. Для прибавления создай UUID operationId один раз и сохраняй его при повторах; после потерянного ответа сначала перечитай план. При конфликте не повторяй автоматически. Не создавай дубликаты целей; после неопределённого ответа create_goal сначала перечитай план. Удаление переносит цель в корзину. Изменяй напоминания и связь с Telegram только по просьбе пользователя. После изменений перечитай соответствующие данные. Подтверждай только фактически сохранённое. Ответы и названия показывай по-русски.",
    },
  );
  async function run(
    operation: (
      api: ReturnType<typeof createPlannerClient>,
      account: z.infer<typeof accountResponse>,
    ) => Promise<Record<string, unknown>>,
  ): Promise<CallToolResult> {
    try {
      const api = createPlannerClient(requireOwnerToken(request, env), fetchPlanner);
      const account = await api.request("/api/auth/me", accountResponse);
      if (account.user.id !== env.RITM_ACCOUNT_ID)
        throw new PlannerError(
          "Подключён другой аккаунт Ритма. Проверьте настройки подключения.",
          403,
          "ACCOUNT_MISMATCH",
        );
      const result = await operation(api, account);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      const failure =
        error instanceof PlannerError
          ? error
          : new PlannerError(
              "Не удалось выполнить запрос Ритма. Перед повторной записью перечитайте план.",
            );
      return {
        isError: true,
        content: [{ type: "text", text: failure.message }],
        _meta: { apiError: { status: failure.status, code: failure.code } },
      };
    }
  }
  server.registerTool(
    "get_account",
    {
      title: "Мой аккаунт",
      description: "Проверяет подключение к личному аккаунту Ритма.",
      inputSchema: z.strictObject({}),
      outputSchema: accountResponse,
      annotations: read,
      _meta: visible,
    },
    () => run(async (_api, account) => account),
  );
  server.registerTool(
    "get_plan",
    {
      title: "Посмотреть план",
      description:
        "Цели и результаты за месяц YYYY-MM. При открытии текущего месяца переносит продолжающиеся цели и напоминания из прошлого месяца. today — текущая дата в часовом поясе аккаунта.",
      inputSchema: getPlanInput,
      outputSchema: getPlanOutput,
      annotations: preparePlan,
      _meta: visible,
    },
    ({ month }) =>
      run(async (api, account) => ({
        ...(await api.request(`/api/plans/${month}`, planResponse)),
        accountId: account.user.id,
      })),
  );
  server.registerTool(
    "create_goal",
    {
      title: "Добавить цель",
      description:
        "Создаёт запрошенную цель: галочка, количество, шкала или время; каждый день, за неделю или за месяц. Не повторяй автоматически после потери ответа.",
      inputSchema: createGoalInput,
      outputSchema: createGoalOutput,
      annotations: create,
      _meta: visible,
    },
    ({ month, input }) =>
      run((api) => api.request(`/api/plans/${month}/goals`, createGoalOutput, input, "POST")),
  );
  server.registerTool(
    "search_planner",
    {
      title: "Поиск целей и записей",
      description:
        "Ищет цели по названию и описанию, записи по заметке во всех месяцах. Поддерживает даты, тип учёта, наличие и выполнение записи, заметки и корзину. Сравнение значения требует goalId; отсутствие записи не означает невыполнение. Для продолжения передай nextOffset как offset.",
      inputSchema: searchInput,
      outputSchema: searchOutput,
      annotations: read,
      _meta: visible,
    },
    ({ query }) =>
      run((api) => {
        const parameters = new URLSearchParams(
          Object.entries(query)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, String(value)]),
        );
        return api.request(`/api/search?${parameters}`, searchOutput);
      }),
  );
  server.registerTool(
    "get_search_goals",
    {
      title: "Цели для фильтра поиска",
      description:
        "Список принадлежащих аккаунту целей с месяцем и единицами измерения, без записей за день.",
      inputSchema: searchGoalsInput,
      outputSchema: searchGoalsOutput,
      annotations: read,
      _meta: visible,
    },
    ({ query }) =>
      run((api) =>
        api.request(
          `/api/search/goals?includeDeleted=${query.includeDeleted === true}`,
          searchGoalsOutput,
        ),
      ),
  );
  server.registerTool(
    "update_goal",
    {
      title: "Изменить цель",
      description:
        "Меняет название, описание, параметры или период цели. Тип учёта после создания менять нельзя.",
      inputSchema: goalIdInput.extend({ input: goalPatch }),
      outputSchema: createGoalOutput,
      annotations: write,
      _meta: visible,
    },
    ({ goalId, input }) =>
      run((api) => api.request(`/api/goals/${goalId}`, createGoalOutput, input, "PATCH")),
  );
  server.registerTool(
    "record_entry",
    {
      title: "Записать результат",
      description:
        "Заменяет результат за дату полным итогом. completed для галочки, value для числа или времени HH:mm, note для заметки. Для ‘ещё’ используй adjust_entry.",
      inputSchema: recordEntryInput,
      outputSchema: recordEntryOutput,
      annotations: write,
      _meta: visible,
    },
    ({ goalId, date, entry }) =>
      run((api) =>
        api.request(`/api/goals/${goalId}/entries/${date}`, recordEntryOutput, entry, "PUT"),
      ),
  );
  server.registerTool(
    "adjust_entry",
    {
      title: "Прибавить к результату",
      description:
        "Прибавляет delta к количеству за дату, сохраняя заметку. Передай новый UUID operationId для новой операции и тот же UUID при повторе. Повтор не прибавит второй раз. Шкала, время и галочка не поддерживают прибавление.",
      inputSchema: entryIdInput.extend({ delta: z.number(), operationId: z.uuid() }),
      outputSchema: recordEntryOutput,
      annotations: write,
      _meta: visible,
    },
    ({ goalId, date, ...input }) =>
      run((api) =>
        api.request(
          `/api/goals/${goalId}/entries/${date}/adjust`,
          recordEntryOutput,
          input,
          "POST",
        ),
      ),
  );
  server.registerTool(
    "delete_entry",
    {
      title: "Убрать результат",
      description: "Удаляет результат и заметку за выбранную дату по просьбе пользователя.",
      inputSchema: entryIdInput,
      outputSchema: success,
      annotations: write,
      _meta: visible,
    },
    ({ goalId, date }) =>
      run((api) =>
        api.request(`/api/goals/${goalId}/entries/${date}`, success, undefined, "DELETE"),
      ),
  );
  server.registerTool(
    "delete_goal",
    {
      title: "Перенести цель в корзину",
      description: "Убирает цель из плана; её можно восстановить из корзины.",
      inputSchema: goalIdInput,
      outputSchema: success,
      annotations: write,
      _meta: visible,
    },
    ({ goalId }) => run((api) => api.request(`/api/goals/${goalId}`, success, undefined, "DELETE")),
  );
  server.registerTool(
    "get_trash",
    {
      title: "Посмотреть корзину",
      description: "Удалённые цели за выбранный месяц.",
      inputSchema: getPlanInput,
      outputSchema: z.object({ month, goals: z.array(goal) }),
      annotations: read,
      _meta: visible,
    },
    ({ month }) =>
      run((api) =>
        api.request(
          `/api/plans/${month}/trash`,
          z.object({ month: z.string(), goals: z.array(goal) }),
        ),
      ),
  );
  server.registerTool(
    "restore_goal",
    {
      title: "Восстановить цель",
      description: "Возвращает удалённую цель и её результаты в план.",
      inputSchema: goalIdInput,
      outputSchema: success,
      annotations: write,
      _meta: visible,
    },
    ({ goalId }) =>
      run((api) => api.request(`/api/goals/${goalId}/restore`, success, undefined, "POST")),
  );
  server.registerTool(
    "reorder_goals",
    {
      title: "Изменить порядок целей",
      description:
        "Задаёт порядок всех активных целей одной группы day, week или month. Передай полный список ID этой группы.",
      inputSchema: getPlanInput.extend({
        input: z.strictObject({
          cadence: z.enum(["day", "week", "month"]),
          goalIds: z.array(z.uuid()).min(1),
        }),
      }),
      outputSchema: success,
      annotations: write,
      _meta: visible,
    },
    ({ month, input }) =>
      run((api) => api.request(`/api/plans/${month}/goals/order`, success, input, "PUT")),
  );
  server.registerTool(
    "get_reminder_settings",
    {
      title: "Посмотреть напоминания",
      description: "Общие настройки, часовой пояс, статус связи с Telegram.",
      inputSchema: z.strictObject({}),
      outputSchema: settingsResponse,
      annotations: read,
      _meta: visible,
    },
    () => run((api) => api.request("/api/reminders/settings", settingsResponse)),
  );
  server.registerTool(
    "save_reminder_settings",
    {
      title: "Настроить напоминания",
      description:
        "Сохраняет включение напоминаний, часовой пояс, тихие часы и время вечернего обзора. Сначала прочитай текущие настройки.",
      inputSchema: z.strictObject({ input: reminderSettingsInput }),
      outputSchema: reminderSettingsInput.passthrough(),
      annotations: write,
      _meta: visible,
    },
    ({ input }) =>
      run((api) =>
        api.request("/api/reminders/settings", reminderSettingsInput.passthrough(), input, "PUT"),
      ),
  );
  server.registerTool(
    "get_goal_reminders",
    {
      title: "Посмотреть расписание целей",
      description:
        "Настройки напоминаний для целей выбранного месяца. При чтении текущего месяца переносит продолжающиеся цели и напоминания из прошлого месяца.",
      inputSchema: getPlanInput,
      outputSchema: z.object({ goals: z.array(reminderRule.extend({ title: z.string() })) }),
      annotations: preparePlan,
      _meta: visible,
    },
    ({ month }) =>
      run((api) =>
        api.request(
          `/api/reminders/goals/${month}`,
          z.object({ goals: z.array(reminderRule.extend({ title: z.string() })) }),
        ),
      ),
  );
  server.registerTool(
    "save_goal_reminder",
    {
      title: "Настроить напоминание о цели",
      description:
        "Режим off — выключено, scheduled — по расписанию, evening — вечерний обзор; время HH:mm, дни недели 1–7.",
      inputSchema: goalIdInput.extend({ input: reminderRuleInput }),
      outputSchema: reminderRule,
      annotations: write,
      _meta: visible,
    },
    ({ goalId, input }) =>
      run((api) => api.request(`/api/reminders/goals/${goalId}`, reminderRule, input, "PUT")),
  );
  const linkResponse = z.object({ url: z.string(), expiresAt: z.number() });
  server.registerTool(
    "connect_telegram",
    {
      title: "Подключить Telegram",
      description:
        "По просьбе пользователя создаёт ссылку для подключения личного чата Telegram. Окончательное подключение подтверждает пользователь в боте.",
      inputSchema: z.strictObject({}),
      outputSchema: linkResponse,
      annotations: create,
      _meta: visible,
    },
    () =>
      run((api) => api.request("/api/reminders/telegram/connect", linkResponse, undefined, "POST")),
  );
  server.registerTool(
    "disconnect_telegram",
    {
      title: "Отключить Telegram",
      description: "По просьбе пользователя отключает доставку напоминаний в Telegram.",
      inputSchema: z.strictObject({}),
      outputSchema: success,
      annotations: write,
      _meta: visible,
    },
    () => run((api) => api.request("/api/reminders/telegram", success, undefined, "DELETE")),
  );
  server.registerResource(
    "ritm-ui",
    UI_URI,
    { title: "Ритм", mimeType: UI_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: UI_URI,
          mimeType: UI_MIME_TYPE,
          text: ui,
          _meta: {
            ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } },
            "openai/widgetDescription":
              "Знакомый интерфейс Ритма: план, результаты, новые цели, корзина и напоминания.",
            "openai/ui": {
              preferredDisplayMode: "fullscreen",
              availableDisplayModes: ["inline", "fullscreen"],
            },
          },
        },
      ],
    }),
  );
  server.registerTool(
    "open_ritm",
    {
      title: "Ритм",
      description:
        "Открывает полный интерфейс Ритма в ChatGPT. Без month читает текущий месяц в часовом поясе аккаунта. При открытии текущего месяца переносит продолжающиеся цели и напоминания из прошлого месяца.",
      inputSchema: z.strictObject({ month: month.optional() }),
      outputSchema: getPlanOutput,
      annotations: preparePlan,
      _meta: {
        ui: { resourceUri: UI_URI, visibility: ["model", "app"] },
        "openai/ui": { entrypoints: [{ type: "global" }] },
        "openai/toolInvocation/invoking": "Открываем Ритм…",
        "openai/toolInvocation/invoked": "План открыт",
      },
    },
    ({ month }) =>
      run(async (api, account) => {
        const selected =
          month ??
          new Intl.DateTimeFormat("sv-SE", {
            timeZone: (await api.request("/api/reminders/settings", settingsResponse)).settings
              .timeZone,
            year: "numeric",
            month: "2-digit",
          }).format(new Date());
        return {
          ...(await api.request(`/api/plans/${selected}`, planResponse)),
          accountId: account.user.id,
        };
      }),
  );
  return server;
}
