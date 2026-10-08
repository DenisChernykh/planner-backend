import { Link } from "react-router";
import type { ProgressGoal, ProgressTarget } from "@/shared/api";
import { formatPlannerDay } from "@/shared/lib/planner-calendar";
import { targetLabel } from "../model/presentation";

export function ProgressMeter({
  target,
  goal,
  today,
  prominent = false,
  compactLabel = false,
}: {
  target: ProgressTarget;
  goal: ProgressGoal;
  today: string;
  prominent?: boolean;
  compactLabel?: boolean;
}) {
  if (target.from > today)
    return (
      <p className="text-xs text-muted-foreground">
        {formatPlannerDay(target.from)}–{formatPlannerDay(target.to)} · ещё не началась
      </p>
    );
  return (
    <div className="space-y-2">
      {prominent ? (
        <>
          <p className="text-xl font-bold sm:text-3xl" title={targetLabel(target, goal)}>
            {target.value}
            <span className="sm:hidden">/{target.target ?? target.originalTarget}</span>
            <span className="hidden sm:inline"> из {target.target ?? target.originalTarget}</span>
          </p>
          {target.percent !== null && (
            <p className="hidden text-xs text-muted-foreground sm:block">{target.percent}%</p>
          )}
        </>
      ) : (
        <p className={`${compactLabel ? "hidden sm:block" : ""} text-sm font-semibold`}>
          {targetLabel(target, goal)}
        </p>
      )}
      {!prominent && target.percent !== null && (
        <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className={`h-full rounded-full ${goal.measurable ? "bg-success" : "bg-muted-foreground"}`}
            style={{ width: `${Math.min(100, target.percent)}%` }}
          />
        </div>
      )}
      {target.reduced && (
        <p className="text-xs text-muted-foreground">
          План уменьшен с {target.originalTarget} до {target.target}: учитываем{" "}
          {formatPlannerDay(target.accounted?.from ?? target.from)}–
          {formatPlannerDay(target.accounted?.to ?? target.to)}
        </p>
      )}
      {target.missingPlan && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            План соседнего месяца ещё не сформирован. Итоговый процент появится после подготовки
            плана.
          </p>
          <Link
            className="text-primary underline underline-offset-4"
            to={`/plans/${target.to.slice(0, 7)}`}
          >
            Открыть план
          </Link>
        </div>
      )}
      {target.overflow > 0 && (
        <p className="text-xs text-success">+{target.overflow} сверх плана</p>
      )}
    </div>
  );
}
