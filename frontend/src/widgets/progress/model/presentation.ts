import type { ProgressGoal, ProgressTarget } from "@/shared/api";

export const formatNumber = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
export function goalRule(goal: ProgressGoal) {
  const rule = goal.tracking;
  const period =
    goal.cadence.period === "day"
      ? "ежедневно"
      : goal.cadence.period === "week"
        ? `${goal.cadence.targetOccurrences} раза в неделю`
        : `${goal.cadence.targetOccurrences} раза в месяц`;
  let tracking = "Отметка";
  if (rule.type === "quantity")
    tracking = `${rule.comparison === "atLeast" ? "Не менее" : rule.comparison === "atMost" ? "Не более" : "Ровно"} ${formatNumber(rule.targetValue)} ${rule.unit ?? "ед."}`;
  if (rule.type === "scale") tracking = `Шкала от ${rule.min} до ${rule.max}`;
  if (rule.type === "time")
    tracking =
      rule.targetStart && rule.targetEnd
        ? `${rule.targetStart}–${rule.targetEnd}${rule.targetStart > rule.targetEnd ? " · через полночь" : ""}`
        : rule.targetStart
          ? `Не раньше ${rule.targetStart}`
          : rule.targetEnd
            ? `Не позже ${rule.targetEnd}`
            : "Время без условия";
  return `${tracking} · ${period}`;
}
export function targetLabel(target: ProgressTarget, goal: ProgressGoal) {
  if (target.target === null && !target.missingPlan) return "Нет периода";
  const unit = !goal.measurable
    ? `записей${goal.cadence.period === "day" ? "" : goal.cadence.period === "week" ? " за неделю" : " за месяц"}`
    : goal.cadence.period === "day"
      ? "дней"
      : goal.cadence.period === "week"
        ? "за неделю"
        : "за месяц";
  return `${target.value} из ${target.target ?? target.originalTarget} ${unit}${target.percent === null ? "" : ` · ${target.percent}%`}`;
}
export function valueLabel(goal: ProgressGoal, value: boolean | number | string | null) {
  if (value === null) return "Нет записи";
  if (typeof value === "boolean") return value ? "Выполнено" : "Отмечено без выполнения";
  if (goal.tracking.type === "quantity")
    return `${formatNumber(Number(value))} ${goal.tracking.unit ?? "ед."}`;
  if (goal.tracking.type === "scale") return `${value} из ${goal.tracking.max}`;
  return String(value);
}
