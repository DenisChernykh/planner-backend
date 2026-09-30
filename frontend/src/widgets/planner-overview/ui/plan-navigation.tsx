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
    <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4">
      <div className="grid w-full grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2 sm:flex sm:w-auto">
        <Button
          variant="outline"
          size="icon-sm"
          className="size-11 rounded-lg sm:size-7 sm:rounded-none"
          onClick={() => navigate(`/plans/${addPlannerMonth(month, -1)}`)}
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft />
        </Button>
        <span className="flex min-w-0 items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold">
          <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {formatPlannerMonth(month)}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          className="size-11 rounded-lg sm:size-7 sm:rounded-none"
          onClick={() => navigate(`/plans/${addPlannerMonth(month, 1)}`)}
          aria-label="Следующий месяц"
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="grid w-full grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2 border-t pt-3 sm:flex sm:w-auto sm:border-0 sm:pt-0">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-11 rounded-lg sm:size-7 sm:rounded-none"
          disabled={weekStart <= weekBounds.first}
          onClick={() => onWeekChange(clampPlannerWeekStart(addPlannerDays(weekStart, -7), month))}
          aria-label="Предыдущая неделя"
        >
          <ChevronLeft />
        </Button>
        <span className="text-center text-xs whitespace-nowrap text-muted-foreground">
          {formatPlannerWeek(weekStart)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-11 rounded-lg sm:size-7 sm:rounded-none"
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
