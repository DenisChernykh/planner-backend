import type { z } from "zod";

export const PLANNER_ORIGIN = "https://app.getplanner.workers.dev";
export type PlannerFetch = (request: Request) => Promise<Response>;
export type SiteEnvironment = {
  RITM_API_TOKEN?: string;
  RITM_OWNER_EMAIL?: string;
  RITM_ACCOUNT_ID?: string;
};

export class PlannerError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 503, code = "DEPENDENCY_UNAVAILABLE") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requireOwnerToken(request: Request, env: SiteEnvironment): string {
  const owner = env.RITM_OWNER_EMAIL?.trim().toLowerCase();
  const visitor = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (
    !owner ||
    !env.RITM_ACCOUNT_ID ||
    !env.RITM_API_TOKEN ||
    !/^ritm_[A-Za-z0-9_-]{43}$/u.test(env.RITM_API_TOKEN)
  ) {
    throw new PlannerError(
      "Подключите Ритм: сохраните ключ, ID аккаунта и email владельца в приватных настройках плагина.",
      401,
      "UNAUTHENTICATED",
    );
  }
  if (visitor !== owner)
    throw new PlannerError(
      "Этот личный плагин доступен только владельцу после входа в ChatGPT.",
      403,
      "FORBIDDEN",
    );
  return env.RITM_API_TOKEN;
}

const errors: Record<string, string> = {
  UNAUTHENTICATED:
    "Ключ Ритма истёк или отозван. Создайте новый ключ в разделе «Подключения» веб-версии.",
  ENTRY_CONFLICT:
    "Результат изменился одновременно в другом окне. Перечитайте план перед новой операцией.",
  ENTRY_DATE_FUTURE: "Нельзя записать результат за будущую дату.",
  ENTRY_DATE_INVALID: "Дата должна относиться к месяцу цели.",
  ENTRY_VALUE_INVALID: "Значение не соответствует типу или диапазону цели.",
  GOAL_TYPE_IMMUTABLE: "Тип учёта существующей цели изменить нельзя.",
  GOAL_ORDER_MISMATCH: "Список должен содержать все активные цели выбранной группы.",
  GOAL_NOT_FOUND: "Цель не найдена в вашем аккаунте.",
  ENTRY_NOT_FOUND: "Запись за эту дату не найдена.",
};

async function boundedJson(response: Response): Promise<unknown> {
  let size = 0;
  const limited = response.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > 1_048_576) throw new Error("Response too large");
        controller.enqueue(chunk);
      },
    }),
  );
  return new Response(limited).json();
}

export function createPlannerClient(token: string, fetchPlanner: PlannerFetch) {
  return {
    async request<T>(
      path: string,
      schema: z.ZodType<T>,
      body?: unknown,
      method = "GET",
    ): Promise<T> {
      const headers = new Headers({ Authorization: `Bearer ${token}`, Accept: "application/json" });
      if (!["GET", "HEAD"].includes(method)) headers.set("Origin", PLANNER_ORIGIN);
      if (body !== undefined) headers.set("Content-Type", "application/json");
      let response: Response;
      try {
        response = await fetchPlanner(
          new Request(`${PLANNER_ORIGIN}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            redirect: "manual",
            signal: AbortSignal.timeout(10_000),
          }),
        );
      } catch {
        throw new PlannerError(
          method === "GET"
            ? "Ритм недоступен. Попробуйте обновить план позже."
            : "Ответ Ритма не получен. Изменение могло сохраниться; сначала перечитайте план. Прибавление повторяйте только с прежним operationId.",
        );
      }
      if (!response.ok) {
        let code = response.status === 401 ? "UNAUTHENTICATED" : "API_ERROR";
        try {
          const data = (await boundedJson(response)) as { code?: unknown };
          if (typeof data.code === "string" && /^[A-Z_]{1,64}$/u.test(data.code)) code = data.code;
        } catch {
          /* Never expose an untrusted upstream body. */
        }
        throw new PlannerError(
          errors[code] ??
            `Не удалось выполнить действие (HTTP ${response.status}). Проверьте данные; перед повторной записью перечитайте план.`,
          response.status,
          code,
        );
      }
      if (response.status === 204) return schema.parse({ success: true });
      try {
        return schema.parse(await boundedJson(response));
      } catch {
        throw new PlannerError(
          "Не удалось прочитать ответ Ритма. Изменение могло сохраниться; перед повторной записью перечитайте план.",
        );
      }
    },
  };
}
