import type { ProgressGoal, ProgressTarget } from "@/shared/api";
import { formatPlannerDay } from "@/shared/lib/planner-calendar";
import { targetLabel } from "../model/presentation";

export function ProgressMeter({
  target,
  goal,
  today,
}: {
  target: ProgressTarget;
  goal: ProgressGoal;
  today: string;
}) {
  if (target.from > today)
    return (
      <p className="text-xs text-muted-foreground">
        {formatPlannerDay(target.from)}–{formatPlannerDay(target.to)} · ещё не началась
      </p>
    );
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{targetLabel(target, goal)}</p>
      {target.percent !== null && (
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
        <p className="text-xs text-muted-foreground">План соседнего месяца ещё не сформирован</p>
      )}
      {target.overflow > 0 && (
        <p className="text-xs text-success">+{target.overflow} сверх плана</p>
      )}
    </div>
  );
}
