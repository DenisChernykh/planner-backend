import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import { Link } from "react-router";
import type { ProgressGoal } from "@/shared/api";
import { formatPlannerDay } from "@/shared/lib/planner-calendar";
import { buttonVariants } from "@/shared/ui";
import { formatNumber, valueLabel } from "../model/presentation";
import { GoalChart } from "./goal-chart";
import { GoalRuleEditor } from "./goal-rule-editor";
import { ProgressMeter } from "./progress-meter";

export function GoalDetail({ goal, today }: { goal: ProgressGoal; today: string }) {
  const numeric = goal.tracking.type === "quantity" || goal.tracking.type === "scale";
  const unit =
    goal.tracking.type === "quantity"
      ? (goal.tracking.unit ?? "ед.")
      : goal.tracking.type === "scale"
        ? `из ${goal.tracking.max}`
        : "";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-5">
          <h2 className="mb-2 text-xs text-muted-foreground">
            {goal.measurable ? "Выполнено" : "Внесено записей"}
          </h2>
          {goal.targets.map((target) => (
            <div key={target.from} className="mb-3">
              <ProgressMeter target={target} goal={goal} today={today} />
            </div>
          ))}
          {!goal.targets.length && <p className="text-lg font-semibold">Нет периода</p>}
        </section>
        <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-5">
          <p className="break-words text-xl font-bold sm:text-3xl">
            {numeric
              ? formatNumber(goal.tracking.type === "quantity" ? goal.sum : goal.average)
              : `${goal.records} из ${goal.eligibleDays}`}
          </p>
          <h2 className="mt-3 break-words text-[10px] text-muted-foreground sm:text-xs">
            {goal.tracking.type === "quantity"
              ? `${unit} за период`
              : goal.tracking.type === "scale"
                ? `Среднее · ${unit}`
                : "Дней с записью"}
          </h2>
        </section>
        <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-5">
          <p className="break-words text-xl font-bold sm:text-3xl">
            {numeric
              ? formatNumber(goal.tracking.type === "scale" ? goal.minimum : goal.average)
              : goal.missing}
          </p>
          <h2 className="mt-3 break-words text-[10px] text-muted-foreground sm:text-xs">
            {goal.tracking.type === "quantity"
              ? `Среднее по записям · ${unit}`
              : goal.tracking.type === "scale"
                ? `Минимум · максимум ${formatNumber(goal.maximum)}`
                : "Дней без записи"}
          </h2>
        </section>
      </div>
      {goal.comparison ? (
        <section
          className={`rounded-xl p-4 ${goal.measurable ? "bg-success-soft" : "bg-primary-soft"}`}
        >
          <h2 className="text-sm font-bold">
            {goal.measurable && goal.comparison.deltaPoints !== null
              ? `${goal.comparison.deltaPoints > 0 ? "+" : ""}${goal.comparison.deltaPoints} п. п. к прошлому периоду`
              : "Сравнение наблюдений"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatPlannerDay(goal.interval?.from ?? goal.days[0]?.date ?? today)}–
            {formatPlannerDay(goal.interval?.to ?? today)}:{" "}
            {goal.measurable ? goal.met : goal.records} {goal.measurable ? "выполнений" : "записей"}
            . За {formatPlannerDay(goal.comparison.interval.from)}–
            {formatPlannerDay(goal.comparison.interval.to)}:{" "}
            {goal.measurable ? goal.comparison.met : goal.comparison.records}.
            {goal.tracking.type === "scale"
              ? ` Среднее: ${formatNumber(goal.average)} и ${formatNumber(goal.comparison.average)}. Значения не оцениваются как улучшение или ухудшение.`
              : " Сравниваем одинаковые дни периода."}
          </p>
        </section>
      ) : (
        <p className="text-xs text-muted-foreground">
          {goal.comparisonReason === "different-rules"
            ? "Правила цели изменились: эти периоды несопоставимы."
            : "Пока недостаточно данных для сравнения."}
        </p>
      )}
      <GoalChart goal={goal} />
      {goal.streak && (
        <section className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="font-bold">Ваш ритм</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <p>
              <strong className="block text-2xl">
                {goal.streak.current === null ? "—" : `${goal.streak.current} дн.`}
              </strong>
              <span className="text-xs text-muted-foreground">Текущая серия</span>
            </p>
            <p>
              <strong className="block text-2xl">{goal.streak.best} дн.</strong>
              <span className="text-xs text-muted-foreground">Лучшая в периоде</span>
            </p>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Серии ограничены выбранным периодом и датой начала учёта. Незаполненный прошедший день
            прерывает подтверждённую серию.
          </p>
        </section>
      )}
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="font-bold">Записи по дням</h2>
        <ul className="mt-3 divide-y">
          {goal.days
            .filter((day) => day.date <= today)
            .slice()
            .reverse()
            .map((day) => {
              const Icon =
                day.state === "met" ? CheckCircle2 : day.state === "below" ? MinusCircle : Circle;
              return (
                <li key={day.date} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <Icon
                    className={`size-4 shrink-0 ${day.state === "met" ? "text-success" : "text-muted-foreground"}`}
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    {formatPlannerDay(day.date)}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {day.state === "excluded"
                        ? "Вне периода учёта"
                        : day.state === "below"
                          ? `${valueLabel(goal, day.value)} · критерий не выполнен`
                          : valueLabel(goal, day.value)}
                    </span>
                  </span>
                  {day.state !== "excluded" && day.goalId && (
                    <Link
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      to={`/plans/${day.date.slice(0, 7)}?goal=${day.goalId}&date=${day.date}`}
                    >
                      {day.value === null ? "Внести" : "Изменить"}
                    </Link>
                  )}
                </li>
              );
            })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Внесено {goal.records} из {goal.eligibleDays} · без записи {goal.missing}
        </p>
      </section>
      <GoalRuleEditor
        key={`${goal.id}-${JSON.stringify(goal.tracking)}-${JSON.stringify(goal.cadence)}`}
        goal={goal}
      />
    </div>
  );
}
