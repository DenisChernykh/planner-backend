import { CheckCircle2, Circle, Clock3, MinusCircle, Pencil, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router";
import type { ProgressGoal } from "@/shared/api";
import { formatPlannerDay } from "@/shared/lib/planner-calendar";
import { cn } from "@/shared/lib/utils";
import { buttonVariants } from "@/shared/ui";
import { formatNumber, valueLabel } from "../model/presentation";
import { GoalChart } from "./goal-chart";
import { GoalRuleEditor } from "./goal-rule-editor";
import { ProgressMeter } from "./progress-meter";

export function GoalDetail({ goal, today }: { goal: ProgressGoal; today: string }) {
  const unit =
    goal.tracking.type === "quantity"
      ? (goal.tracking.unit ?? "ед.")
      : goal.tracking.type === "scale"
        ? `из ${goal.tracking.max}`
        : "";
  const target = goal.targets.length === 1 ? goal.targets[0] : undefined;
  const flexible = goal.cadence.period !== "day";
  const lastTime = goal.days.findLast((day) => typeof day.value === "string")?.value ?? "—";
  const primary =
    goal.tracking.type === "scale"
      ? formatNumber(goal.average)
      : goal.tracking.type === "time" && !goal.measurable
        ? String(lastTime)
        : null;
  const primaryCaption =
    goal.tracking.type === "scale"
      ? `Среднее · ${unit}`
      : goal.tracking.type === "time" && !goal.measurable
        ? "Последняя запись"
        : goal.measurable
          ? "Выполнено"
          : "Внесено записей";
  const comparisonPanel = goal.comparison ? (
    <section
      className={`rounded-xl p-4 ${goal.measurable && (goal.comparison.deltaPoints ?? 0) > 0 ? "bg-success-soft" : "bg-muted"}`}
    >
      <h2 className="text-sm font-bold">
        {goal.measurable && goal.comparison.deltaPoints !== null
          ? `${goal.comparison.deltaPoints > 0 ? "+" : ""}${goal.comparison.deltaPoints} п. п. к прошлому периоду`
          : goal.measurable
            ? "Сравнение с прошлым периодом"
            : "Сравнение наблюдений"}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatPlannerDay(goal.interval?.from ?? goal.days[0]?.date ?? today)}–
        {formatPlannerDay(goal.interval?.to ?? today)}:{" "}
        {goal.measurable ? (target?.value ?? goal.met) : goal.records} из{" "}
        {goal.measurable ? (target?.target ?? goal.eligibleDays) : goal.eligibleDays}
        {target?.percent === null || target?.percent === undefined ? "" : ` · ${target.percent}%`}.
        За {formatPlannerDay(goal.comparison.interval.from)}–
        {formatPlannerDay(goal.comparison.interval.to)}:{" "}
        {goal.measurable
          ? (goal.comparison.targets[0]?.value ?? goal.comparison.met)
          : goal.comparison.records}{" "}
        из{" "}
        {goal.measurable
          ? (goal.comparison.targets[0]?.target ?? goal.comparison.eligibleDays)
          : goal.comparison.eligibleDays}
        {goal.comparison.percent === null ? "" : ` · ${goal.comparison.percent}%`}.
        {goal.tracking.type === "scale"
          ? ` Среднее: ${formatNumber(goal.average)} и ${formatNumber(goal.comparison.average)}. Значения не оцениваются как улучшение или ухудшение.`
          : " Сопоставляем одинаковые дни."}
      </p>
      {goal.tracking.type === "quantity" && (
        <p className="mt-2 text-xs text-muted-foreground">
          {formatNumber(goal.sum)} {unit} против {formatNumber(goal.comparison.sum)} {unit}. Среднее
          по записям: {formatNumber(goal.average)} и {formatNumber(goal.comparison.average)}.
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Внесено {goal.records} из {goal.eligibleDays} и {goal.comparison.records} из{" "}
        {goal.comparison.eligibleDays}.
        {goal.interval?.to === today ? " Сегодняшний день ещё идёт." : ""}
      </p>
    </section>
  ) : null;
  const streakPanel = goal.streak && (
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
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-5">
          {primary !== null && <p className="text-xl font-bold sm:text-3xl">{primary}</p>}
          {primary === null && (
            <>
              {goal.targets.map((target) => (
                <div key={target.from} className="mb-3">
                  {goal.targets.length > 1 && (
                    <p className="mb-1 text-xs text-muted-foreground">
                      {formatPlannerDay(target.from)}–{formatPlannerDay(target.to)}
                    </p>
                  )}
                  <ProgressMeter target={target} goal={goal} today={today} prominent />
                </div>
              ))}
              {!goal.targets.length && <p className="text-lg font-semibold">Нет периода</p>}
            </>
          )}
          <h2 className="mt-3 text-[10px] text-muted-foreground sm:text-xs">{primaryCaption}</h2>
        </section>
        <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-5">
          <p className="break-words text-xl font-bold sm:text-3xl">
            {goal.tracking.type === "quantity"
              ? formatNumber(goal.sum)
              : goal.tracking.type === "check" && flexible && target
                ? formatNumber(target?.remaining ?? null)
                : `${goal.records} из ${goal.eligibleDays}`}
          </p>
          <h2 className="mt-3 break-words text-[10px] text-muted-foreground sm:text-xs">
            {goal.tracking.type === "quantity"
              ? `${unit} за период`
              : goal.tracking.type === "scale"
                ? "Внесено оценок"
                : goal.tracking.type === "check" && flexible && target
                  ? "Осталось по плану"
                  : "Дней с записью"}
          </h2>
        </section>
        <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-5">
          <p className="break-words text-xl font-bold sm:text-3xl">
            {goal.tracking.type === "quantity"
              ? formatNumber(goal.average)
              : goal.tracking.type === "scale"
                ? `${formatNumber(goal.minimum)}–${formatNumber(goal.maximum)}`
                : goal.tracking.type === "check" && flexible
                  ? goal.falseRecords
                  : goal.missing}
          </p>
          <h2 className="mt-3 break-words text-[10px] text-muted-foreground sm:text-xs">
            {goal.tracking.type === "quantity"
              ? `Среднее по записям · ${unit}`
              : goal.tracking.type === "scale"
                ? "Диапазон внесённых оценок"
                : goal.tracking.type === "check" && flexible
                  ? "Отметок «нет»"
                  : "Дней без записи"}
          </h2>
        </section>
      </div>
      {!flexible && goal.measurable && comparisonPanel}
      {flexible && target && (
        <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="font-bold">План {goal.cadence.period === "week" ? "недели" : "месяца"}</h2>
          {target.target !== null && (
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              {Array.from({ length: target.target }, (_, order) => ({
                id: `${target.from}:${order}`,
                order,
              })).map(({ id, order }) => {
                const confirmed = goal.days.filter((day) =>
                  goal.measurable ? day.state === "met" : day.value !== null,
                )[order];
                return (
                  <div
                    key={id}
                    className={`min-w-0 flex-1 rounded-lg p-3 text-center ${confirmed ? "bg-success-soft" : "bg-muted"}`}
                  >
                    {confirmed ? (
                      <CheckCircle2 className="mx-auto size-5 text-success" />
                    ) : (
                      <Circle className="mx-auto size-5 text-muted-foreground" />
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {confirmed ? formatPlannerDay(confirmed.date) : "Осталось"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          {target.remaining !== null && <p className="text-sm">Осталось: {target.remaining}</p>}
          <p className="text-xs text-muted-foreground">
            Дни выполнения выбираете вы. Свободный день не считается пропуском.
          </p>
        </section>
      )}
      {!(goal.tracking.type === "check" && flexible) && <GoalChart goal={goal} />}
      {!flexible && !goal.measurable && comparisonPanel}
      {goal.comparison && streakPanel}
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="font-bold">
          {goal.comparison
            ? "Записи и прошлый период"
            : flexible
              ? "Записи за период"
              : "Записи по дням"}
        </h2>
        <ul className="mt-3 divide-y">
          {goal.days
            .filter(
              (day) =>
                day.state !== "excluded" && day.date <= today && (!flexible || day.value !== null),
            )
            .slice()
            .reverse()
            .map((day) => {
              const Icon =
                day.state === "met"
                  ? CheckCircle2
                  : day.state === "below"
                    ? MinusCircle
                    : day.value !== null
                      ? goal.tracking.type === "scale"
                        ? SlidersHorizontal
                        : Clock3
                      : Circle;
              return (
                <li key={day.date} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <Icon
                    className={`size-4 shrink-0 ${day.state === "met" ? "text-success" : day.value !== null && !goal.measurable ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    {formatPlannerDay(day.date)}
                    {!goal.measurable && day.value !== null && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {goal.tracking.type === "scale" ? "Оценка внесена" : "Время записано"}
                      </span>
                    )}
                    {day.state === "excluded" && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Вне периода учёта
                      </span>
                    )}
                    {goal.comparison &&
                      (() => {
                        const previous =
                          goal.comparison.days[
                            goal.days.findIndex((item) => item.date === day.date)
                          ];
                        return previous ? (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {formatPlannerDay(previous.date)}: {valueLabel(goal, previous.value)}
                            {previous.state === "below" ? " · критерий не выполнен" : ""}
                          </span>
                        ) : null;
                      })()}
                  </span>
                  <span
                    className={`text-right text-sm font-semibold ${day.value === null ? "text-muted-foreground" : ""}`}
                  >
                    {day.state !== "excluded" &&
                      (typeof day.value === "boolean"
                        ? day.value
                          ? "Да"
                          : "Нет"
                        : valueLabel(goal, day.value))}
                    {day.state === "below" && typeof day.value !== "boolean" && (
                      <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                        Критерий не выполнен
                      </span>
                    )}
                  </span>
                  {day.state !== "excluded" && day.goalId && (
                    <Link
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "icon" }),
                        "size-11 rounded-lg text-primary",
                      )}
                      aria-label={`${day.value === null ? "Внести" : "Изменить"} · ${formatPlannerDay(day.date)}`}
                      to={`/plans/${day.date.slice(0, 7)}?goal=${day.goalId}&date=${day.date}`}
                    >
                      <Pencil className="size-3.5" />
                    </Link>
                  )}
                </li>
              );
            })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          {flexible
            ? `Внесено записей: ${goal.records}. Свободные дни не считаются пропусками.`
            : `Внесено ${goal.records} из ${goal.eligibleDays} · без записи ${goal.missing}`}
        </p>
      </section>
      {!goal.comparison && streakPanel}
      {!goal.comparison && (
        <p className="text-xs text-muted-foreground">
          {goal.comparisonReason === "different-rules"
            ? "Правила цели изменились: эти периоды несопоставимы."
            : "Пока недостаточно данных для сравнения."}
        </p>
      )}
      {flexible && goal.history.length > 0 && (
        <section className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="font-bold">Прошлые недели</h2>
          <ul className="mt-3 divide-y">
            {goal.history.map((item) => (
              <li
                key={item.from}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span className="text-sm">
                  {formatPlannerDay(item.from)}–{formatPlannerDay(item.to)}
                </span>
                <div className="min-w-0">
                  <ProgressMeter target={item} goal={goal} today={today} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {flexible && comparisonPanel}
      {!goal.measurable && (
        <p className="text-xs text-muted-foreground">
          Это наблюдения. Записи не оцениваются как успех или неудача.
        </p>
      )}
      {flexible && (
        <p className="rounded-xl bg-muted p-4 text-xs text-muted-foreground">
          Серии доступны у ежедневных измеримых целей. Здесь следим за планом периода.
        </p>
      )}
      <Link
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-11 w-full rounded-lg text-primary sm:w-auto",
        )}
        to={`/plans/${goal.days[0]?.date.slice(0, 7) ?? today.slice(0, 7)}?goal=${goal.id}`}
      >
        Открыть записи в плане
      </Link>
      <GoalRuleEditor
        key={`${goal.id}-${JSON.stringify(goal.tracking)}-${JSON.stringify(goal.cadence)}`}
        goal={goal}
      />
    </div>
  );
}
