import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";

import {
  addPlannerDays,
  addPlannerMonth,
  clampPlannerWeekStart,
  formatPlannerWeek,
  getPlannerMonthWeekBounds,
} from "@/shared/lib/planner-calendar";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { Button } from "@/shared/ui";

type PlanNavigationProps = {
  month: string;
  weekStart: string;
  onWeekChange: (date: string) => void;
};

export function PlanNavigation({ month, weekStart, onWeekChange }: PlanNavigationProps) {
  const navigate = useNavigate();
  const weekBounds = getPlannerMonthWeekBounds(month);
  return (
    <div className="mb-4 flex items-center justify-between rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => navigate(`/plans/${addPlannerMonth(month, -1)}`)}
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft />
        </Button>
        <CalendarDays className="size-4 text-primary" aria-hidden="true" />
        <span className="text-sm font-semibold">{formatPlannerMonth(month)}</span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => navigate(`/plans/${addPlannerMonth(month, 1)}`)}
          aria-label="Следующий месяц"
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={weekStart <= weekBounds.first}
          onClick={() => onWeekChange(clampPlannerWeekStart(addPlannerDays(weekStart, -7), month))}
          aria-label="Предыдущая неделя"
        >
          <ChevronLeft />
        </Button>
        <span className="text-xs text-muted-foreground">{formatPlannerWeek(weekStart)}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={weekStart >= weekBounds.last}
          onClick={() => onWeekChange(clampPlannerWeekStart(addPlannerDays(weekStart, 7), month))}
          aria-label="Следующая неделя"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
