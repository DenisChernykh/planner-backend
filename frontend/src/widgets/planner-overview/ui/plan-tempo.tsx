import type { ProgressGoal } from "@/shared/api";
import { clampProgress, getProgress, type PlanGoal } from "../model/plan-model";

export function PlanTempo({
  goal,
  month,
  today,
  weekDates,
  progress,
  state,
}: {
  goal: PlanGoal;
  month: string;
  today: string;
  weekDates: string[];
  progress?: ProgressGoal;
  state: "embedded" | "pending" | "error" | "ready";
}) {
  const legacy = state === "embedded" ? getProgress(goal, weekDates, month, today) : null;
  const target = progress?.targets.find(
    (item) => goal.cadence.period !== "month" || item.from.startsWith(month),
  );
  const observations = progress && !progress.measurable;
  const value = legacy?.value ?? target?.value;
  const total = legacy?.total ?? target?.target;
  const percent = legacy ? clampProgress(legacy.value, legacy.total) : target?.percent;
  const label = legacy?.label ?? (observations ? "записей" : "выполнено");
  const unavailable =
    state === "pending"
      ? "Рассчитываем…"
      : state === "error"
        ? "Недоступно"
        : target?.missingPlan
          ? "Нет плана следующего месяца"
          : "Вне периода учёта";
  return (
    <section
      className="flex min-h-[72px] flex-col justify-center gap-1.5 border-r px-3"
      aria-label={`Темп: ${goal.title}`}
    >
      {target?.missingPlan ? (
        <>
          <span className="text-sm font-bold text-primary">
            {target.value} / {target.originalTarget}
          </span>
          <span className="text-sm text-muted-foreground">
            План соседнего месяца ещё не сформирован
          </span>
        </>
      ) : value !== undefined && total != null && total > 0 ? (
        <>
          <span
            className={`text-sm font-bold ${observations ? "text-foreground" : "text-primary"}`}
          >
            {value} / {total}
          </span>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${observations ? "bg-muted-foreground" : "bg-primary"}`}
              style={{ width: `${Math.min(100, percent ?? 0)}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {label}
            {target?.reduced ? " · план уменьшен" : ""}
          </span>
        </>
      ) : (
        <span className="text-sm text-muted-foreground">{unavailable}</span>
      )}
    </section>
  );
}
