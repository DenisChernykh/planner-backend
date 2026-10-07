import type { SearchGoal, SearchResult } from "@/shared/api";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { cadenceLabels, trackingLabels } from "./search-form";

export function formatSearchDate(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
export function searchGoalMeta(goal: SearchGoal) {
  const count = goal.cadence.period === "day" ? 0 : goal.cadence.targetOccurrences;
  const word = new Intl.PluralRules("ru-RU").select(count) === "few" ? "раза" : "раз";
  const cadence =
    goal.cadence.period === "day"
      ? cadenceLabels.day
      : `${count} ${word} ${goal.cadence.period === "week" ? "в неделю" : "в месяц"}`;
  return `${trackingLabels[goal.tracking.type]} · ${cadence}`;
}
export function resultValue(result: SearchResult) {
  if (result.kind === "goal") return formatPlannerMonth(result.goal.month);
  if (!result.entry) return "Нет записи";
  const value = result.entry.value;
  if (typeof value === "boolean") return value ? "Выполнено" : "Не выполнено";
  const unit =
    result.goal.tracking.type === "quantity"
      ? (result.goal.tracking.unit ?? "")
      : result.goal.tracking.type === "scale"
        ? `из ${result.goal.tracking.max}`
        : "";
  return `${typeof value === "number" ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 10 }).format(value) : value} ${unit}`.trim();
}
export function resultDestination(result: SearchResult) {
  const params = new URLSearchParams({ goal: result.goal.id });
  if (result.date) params.set("date", result.date);
  return `/plans/${result.goal.month}${result.goal.deletedAt !== null ? "/trash" : ""}?${params}`;
}
export function normalizeHighlight(value: string) {
  return value.toLowerCase().replace(/ё/gu, "е");
}
export function matchSnippet(text: string, query: string, maxLength = 160) {
  if (text.length <= maxLength) return text;
  const term = normalizeHighlight(query).trim().split(/\s+/u)[0] ?? "";
  const found = term ? normalizeHighlight(text).indexOf(term) : 0;
  const start = Math.max(0, found - 40);
  return `${start ? "…" : ""}${text.slice(start, start + maxLength)}${start + maxLength < text.length ? "…" : ""}`;
}
