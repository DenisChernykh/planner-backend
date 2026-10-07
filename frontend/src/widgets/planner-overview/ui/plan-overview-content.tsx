import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";

import type { GetApiPlansMonth200, GetApiPlansMonth200GoalsItem } from "@/shared/api";
import {
  clampPlannerDate,
  getPlannerMonthEnd,
  getPlannerWeekDates,
  getPlannerWeekStart,
} from "@/shared/lib/planner-calendar";
import { Alert, AlertDescription, AlertTitle, Button } from "@/shared/ui";

import { FactInspector } from "./fact-inspector";
import { PlanGrid } from "./plan-grid";
import { PlanHeader } from "./plan-header";
import { PlanNavigation } from "./plan-navigation";

type PlanOverviewContentProps = { month: string; plan: GetApiPlansMonth200; notice: string | null };

export function PlanOverviewContent({ month, plan, notice }: PlanOverviewContentProps) {
  const [params, setParams] = useSearchParams();
  const fromSearch = useLocation().state?.fromSearch === true;
  const initialDate = clampPlannerDate(plan.today, plan.today, month);
  const requestedDate = params.get("date") ?? initialDate;
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/u.test(requestedDate)
    ? clampPlannerDate(requestedDate, getPlannerMonthEnd(month), month)
    : initialDate;
  const selectedGoal = plan.goals.find((goal) => goal.id === params.get("goal"));
  const selectedGoalId = selectedGoal?.id;
  const [weekStart, setWeekStart] = useState(() =>
    getPlannerWeekStart(selectedGoal ? selectedDate : initialDate),
  );
  const weekDates = getPlannerWeekDates(weekStart);
  const select = (goal: GetApiPlansMonth200GoalsItem, date: string) => {
    setParams(
      (previous) => {
        previous.set("goal", goal.id);
        previous.set("date", date);
        return previous;
      },
      { replace: true, preventScrollReset: true },
    );
  };
  useEffect(() => {
    if (selectedGoalId) setWeekStart(getPlannerWeekStart(selectedDate));
  }, [selectedGoalId, selectedDate]);
  useEffect(() => {
    if (!selectedGoalId || weekStart !== getPlannerWeekStart(selectedDate)) return;
    const frame = requestAnimationFrame(() => {
      const row = [...document.querySelectorAll<HTMLElement>("[data-goal-id]")].find(
        (node) => node.dataset.goalId === selectedGoalId,
      );
      const cell = row?.querySelector<HTMLElement>(`[data-entry-date="${selectedDate}"]`);
      cell?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      if (fromSearch) cell?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedGoalId, selectedDate, weekStart, fromSearch]);

  return (
    <section className="flex min-h-[calc(100svh-3.5rem)] min-w-0 bg-background">
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-8 sm:py-7">
        <PlanHeader month={month} hasGoals={plan.goals.length > 0} />
        <PlanNavigation month={month} weekStart={weekStart} onWeekChange={setWeekStart} />
        {notice === "goal-created" && (
          <Alert className="mb-4 border-success/30 bg-success-soft text-success">
            <AlertTitle>Цель создана</AlertTitle>
            <AlertDescription className="text-success/80">
              Она уже добавлена в план на выбранный месяц.
            </AlertDescription>
          </Alert>
        )}
        {plan.goals.length === 0 && (
          <div className="mb-4 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
            <h2 className="text-lg font-bold">План пока пуст</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Создайте цель с подходящим способом учёта.
            </p>
            <Link className="mt-4 inline-block" to={`/plans/${month}/goals/new`}>
              <Button>
                <Plus data-icon="inline-start" /> Создать цель
              </Button>
            </Link>
          </div>
        )}
        {plan.goals.length > 0 && (
          <PlanGrid
            month={month}
            today={plan.today}
            weekDates={weekDates}
            goals={plan.goals}
            onSelect={select}
            selection={selectedGoalId ? { goalId: selectedGoalId, date: selectedDate } : undefined}
          />
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Дни вне месяца заблокированы. Будущие даты доступны для просмотра, но не для
          редактирования.
        </p>
      </main>
      {selectedGoal && (
        <FactInspector
          key={selectedGoal.id}
          goal={selectedGoal}
          month={month}
          today={plan.today}
          date={selectedDate}
          onDateChange={(date) => select(selectedGoal, date)}
          onClose={() =>
            setParams(
              (previous) => {
                previous.delete("goal");
                previous.delete("date");
                return previous;
              },
              { replace: true, preventScrollReset: true },
            )
          }
        />
      )}
    </section>
  );
}
