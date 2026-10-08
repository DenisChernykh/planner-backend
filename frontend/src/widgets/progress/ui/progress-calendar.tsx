import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import { useState } from "react";
import type { ProgressOverview } from "@/shared/api";
import { formatPlannerDay, getPlannerDayName } from "@/shared/lib/planner-calendar";

export function ProgressCalendar({ data }: { data: ProgressOverview }) {
  const daily = data.goals.filter((goal) => goal.cadence.period === "day" && goal.measurable);
  const [selected, setSelected] = useState(
    data.today >= data.requested.from && data.today <= data.requested.to
      ? data.today
      : (data.actual?.to ?? data.requested.from),
  );
  if (!daily.length) return null;
  const days = daily[0]?.days ?? [];
  const details = daily.flatMap((goal) => {
    const day = goal.days.find((item) => item.date === selected);
    return day ? [{ title: goal.title, day }] : [];
  });
  const completed = details.filter(({ day }) => day.state === "met").length;
  const eligible = details.filter(({ day }) => !["excluded", "future"].includes(day.state)).length;
  const padding =
    data.period === "month"
      ? (new Date(`${data.requested.from}T12:00:00Z`).getUTCDay() + 6) % 7
      : 0;
  return (
    <section
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
      aria-label="Активность по дням"
    >
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-base font-bold">Активность по дням</h2>
        <p className="text-xs text-muted-foreground">
          {data.requested.from <= data.today && data.requested.to >= data.today
            ? `${formatPlannerDay(data.today)} · день ещё идёт`
            : "Подтверждённые записи за период"}
        </p>
      </div>
      {data.period === "month" && (
        <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {["mon", "tue", "wed", "thu", "fri", "sat"].slice(0, padding).map((weekday) => (
          <span key={weekday} aria-hidden="true" />
        ))}
        {days.map((day) => {
          const values = daily.flatMap((goal) =>
            goal.days.filter((item) => item.date === day.date),
          );
          const count = values.filter((item) => item.state === "met").length;
          const allowed = values.filter(
            (item) => !["excluded", "future"].includes(item.state),
          ).length;
          const future = day.date > data.today;
          const excluded = values.every((item) => item.state === "excluded");
          const label = excluded ? "Вне учёта" : future ? "Впереди" : `${count} из ${allowed}`;
          const weekday = new Date(`${day.date}T12:00:00Z`).getUTCDay();
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelected(day.date)}
              aria-pressed={selected === day.date}
              aria-label={`${formatPlannerDay(day.date)}: ${label}`}
              className={`min-w-0 rounded-lg px-0.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-primary ${data.period === "month" ? "py-2 sm:py-3" : "py-3 sm:py-5"} ${selected === day.date || day.date === data.today ? "bg-primary-soft text-primary" : allowed > 0 && count === allowed ? "bg-success-soft" : "bg-muted/50"}`}
            >
              {data.period === "week" && (
                <span className="block text-[10px] text-muted-foreground">
                  {getPlannerDayName((weekday + 6) % 7)}
                </span>
              )}
              <span className="mt-1 block text-sm font-bold">{Number(day.date.slice(8))}</span>
              <span
                className={`mt-2 justify-center gap-0.5 sm:gap-1 ${data.period === "month" ? "flex" : "hidden sm:flex"}`}
              >
                {values
                  .filter(
                    (value) =>
                      value.goalId !== null && !["excluded", "future"].includes(value.state),
                  )
                  .slice(0, 4)
                  .map((value) => {
                    const Icon =
                      value.state === "met"
                        ? CheckCircle2
                        : value.state === "below"
                          ? MinusCircle
                          : Circle;
                    return (
                      <Icon
                        key={value.goalId}
                        className={`size-2.5 sm:size-3.5 ${value.state === "met" ? "text-success" : "text-muted-foreground"}`}
                        aria-hidden="true"
                      />
                    );
                  })}
              </span>
              <span
                className={`mt-2 text-[9px] text-muted-foreground sm:text-[10px] ${data.period === "month" ? "block" : "hidden sm:block"}`}
              >
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">
                  {excluded ? "—" : future ? "·" : `${count}/${allowed}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="rounded-lg bg-primary-soft p-3 text-xs text-primary">
        {formatPlannerDay(selected)} ·{" "}
        {selected > data.today
          ? "Впереди"
          : eligible
            ? `выполнено ${completed} из ${eligible}`
            : "Вне периода учёта"}
        <span className="mt-1 block text-muted-foreground">
          {details
            .map(
              ({ title, day }) =>
                `${title}: ${day.state === "met" ? "выполнено" : day.state === "below" ? "ниже цели" : day.state === "excluded" ? "вне периода учёта" : day.state === "future" ? "впереди" : "нет записи"}`,
            )
            .join(". ")}
        </span>
      </p>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="size-3.5 text-success" />
          Выполнено
        </span>
        <span className="flex items-center gap-1">
          <MinusCircle className="size-3.5" />
          Ниже цели
        </span>
        <span className="flex items-center gap-1">
          <Circle className="size-3.5" />
          Нет записи
        </span>
        <span>— Вне учёта · Будущий день</span>
      </div>
    </section>
  );
}
