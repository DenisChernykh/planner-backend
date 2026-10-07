import { z } from "zod";
import type { GetApiSearchParams, SearchGoal } from "@/shared/api";
import { getPlannerMonthEnd, getPlannerMonthStart } from "@/shared/lib/planner-calendar";

export const searchFormSchema = z.object({
  q: z.string().max(160),
  kind: z.enum(["all", "goals", "entries"]),
  scope: z.enum(["all", "month", "range"]),
  from: z.string().max(10),
  to: z.string().max(10),
  tracking: z.enum(["any", "check", "quantity", "scale", "time"]),
  cadence: z.enum(["any", "day", "week", "month"]),
  goalId: z.string().max(36),
  presence: z.enum(["any", "present", "missing"]),
  met: z.enum(["any", "met", "unmet"]),
  note: z.enum(["any", "present", "absent"]),
  comparison: z.enum(["any", "lt", "gt", "eq", "between"]),
  value: z.string().max(64),
  valueTo: z.string().max(64),
  includeDeleted: z.boolean(),
});
export type SearchForm = z.infer<typeof searchFormSchema>;
export const initialSearchForm: SearchForm = {
  q: "",
  kind: "all",
  scope: "all",
  from: "",
  to: "",
  tracking: "any",
  cadence: "any",
  goalId: "",
  presence: "any",
  met: "any",
  note: "any",
  comparison: "any",
  value: "",
  valueTo: "",
  includeDeleted: false,
};
const emptyEntryFilters = {
  presence: "any",
  met: "any",
  note: "any",
  comparison: "any",
  value: "",
  valueTo: "",
} as const;

export function hasEntryFilters(form: SearchForm) {
  return (
    form.presence !== "any" ||
    form.met !== "any" ||
    form.note !== "any" ||
    form.comparison !== "any"
  );
}
export function updateSearchForm(
  form: SearchForm,
  patch: Partial<SearchForm>,
  goals: SearchGoal[],
): SearchForm {
  const next = { ...form, ...patch };
  if (patch.kind && patch.kind !== "entries") Object.assign(next, emptyEntryFilters);
  if (patch.goalId !== undefined && patch.goalId !== form.goalId)
    Object.assign(next, { comparison: "any", value: "", valueTo: "" });
  if (next.presence === "missing")
    Object.assign(next, { met: "any", note: "any", comparison: "any", value: "", valueTo: "" });
  const goal = goals.find((item) => item.id === next.goalId);
  if (
    goal &&
    ((next.tracking !== "any" && goal.tracking.type !== next.tracking) ||
      (next.cadence !== "any" && goal.cadence.period !== next.cadence) ||
      (!next.includeDeleted && goal.deletedAt !== null))
  ) {
    Object.assign(next, { goalId: "", comparison: "any", value: "", valueTo: "" });
  }
  if (hasEntryFilters(next)) next.kind = "entries";
  return next;
}
export function changeSearchScope(scope: SearchForm["scope"], month: string): Partial<SearchForm> {
  return {
    scope,
    from: scope === "all" ? "" : getPlannerMonthStart(month),
    to: scope === "all" ? "" : getPlannerMonthEnd(month),
  };
}
export function numericSearchValue(value: string, time: boolean): number | null {
  if (time)
    return /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)
      ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
      : null;
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/u.test(value.trim())) return null;
  const number = Number(value.trim().replace(",", "."));
  return Number.isFinite(number) ? number : null;
}
export function searchFormError(form: SearchForm, goals: SearchGoal[]): string | null {
  if (form.scope !== "all") {
    if (!z.iso.date().safeParse(form.from).success || !z.iso.date().safeParse(form.to).success)
      return "Укажите начало и конец периода.";
    if (form.from > form.to) return "Конец периода должен быть не раньше начала.";
  }
  if (form.comparison === "any") return null;
  const goal = goals.find((item) => item.id === form.goalId);
  if (!goal || goal.tracking.type === "check")
    return "Выберите цель с числовым значением или временем.";
  const time = goal.tracking.type === "time";
  const value = numericSearchValue(form.value, time);
  if (value === null)
    return time ? "Укажите время в формате ЧЧ:ММ." : "Укажите число для сравнения.";
  if (form.comparison === "between") {
    const upper = numericSearchValue(form.valueTo, time);
    if (upper === null) return "Укажите обе границы диапазона.";
    if (upper < value) return "Верхняя граница должна быть не меньше нижней.";
  }
  return null;
}
export function searchParameters(form: SearchForm): GetApiSearchParams {
  return {
    q: form.q.trim(),
    kind: form.kind,
    ...(form.scope === "all" ? {} : { from: form.from, to: form.to }),
    ...(form.tracking === "any" ? {} : { tracking: form.tracking }),
    ...(form.cadence === "any" ? {} : { cadence: form.cadence }),
    ...(form.goalId ? { goalId: form.goalId } : {}),
    presence: form.presence,
    met: form.met,
    note: form.note,
    ...(form.comparison === "any"
      ? {}
      : {
          comparison: form.comparison,
          value: form.value.trim().replace(",", "."),
          ...(form.comparison === "between"
            ? { valueTo: form.valueTo.trim().replace(",", ".") }
            : {}),
        }),
    includeDeleted: form.includeDeleted ? "true" : "false",
    limit: 50,
  };
}
export function hasSearch(form: SearchForm): boolean {
  return (
    !!form.q.trim() ||
    form.kind !== "all" ||
    form.scope !== "all" ||
    form.tracking !== "any" ||
    form.cadence !== "any" ||
    !!form.goalId ||
    hasEntryFilters(form) ||
    form.includeDeleted
  );
}

export const trackingLabels = {
  check: "Галочка",
  quantity: "Количество",
  scale: "Шкала",
  time: "Время",
} as const;
export const cadenceLabels = { day: "Каждый день", week: "За неделю", month: "За месяц" } as const;
export const comparisonLabels = {
  lt: "Меньше",
  gt: "Больше",
  eq: "Равно",
  between: "Диапазон",
} as const;
export function goalUnit(goal?: SearchGoal) {
  return goal?.tracking.type === "quantity"
    ? (goal.tracking.unit ?? "")
    : goal?.tracking.type === "scale"
      ? "балл."
      : "";
}
export function searchChips(form: SearchForm, goals: SearchGoal[]) {
  const goal = goals.find((item) => item.id === form.goalId);
  const chips: { key: keyof SearchForm; label: string; reset: Partial<SearchForm> }[] = [];
  if (form.scope !== "all")
    chips.push({
      key: "scope",
      label: `${form.from} — ${form.to}`,
      reset: { scope: "all", from: "", to: "" },
    });
  if (form.goalId)
    chips.push({ key: "goalId", label: goal?.title ?? "Выбранная цель", reset: { goalId: "" } });
  if (form.comparison !== "any")
    chips.push({
      key: "comparison",
      label:
        `${comparisonLabels[form.comparison]} ${form.value}${form.comparison === "between" ? ` — ${form.valueTo}` : ""} ${goalUnit(goal)}`.trim(),
      reset: { comparison: "any", value: "", valueTo: "" },
    });
  if (form.tracking !== "any")
    chips.push({
      key: "tracking",
      label: trackingLabels[form.tracking],
      reset: { tracking: "any" },
    });
  if (form.cadence !== "any")
    chips.push({ key: "cadence", label: cadenceLabels[form.cadence], reset: { cadence: "any" } });
  if (form.presence !== "any")
    chips.push({
      key: "presence",
      label: form.presence === "missing" ? "Нет записи" : "Есть запись",
      reset: { presence: "any" },
    });
  if (form.met !== "any")
    chips.push({
      key: "met",
      label: form.met === "met" ? "Выполнено" : "Не выполнено",
      reset: { met: "any" },
    });
  if (form.note !== "any")
    chips.push({
      key: "note",
      label: form.note === "present" ? "С заметкой" : "Без заметки",
      reset: { note: "any" },
    });
  if (form.includeDeleted)
    chips.push({
      key: "includeDeleted",
      label: "Включая удалённые",
      reset: { includeDeleted: false },
    });
  return chips;
}
