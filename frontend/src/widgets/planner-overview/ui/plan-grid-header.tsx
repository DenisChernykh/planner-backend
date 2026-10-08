import { formatPlannerDay, getPlannerDayName } from "@/shared/lib/planner-calendar";

export function PlanGridHeader({ weekDates, today }: { weekDates: string[]; today: string }) {
  return (
    <div className="sticky top-0 z-30 hidden grid-cols-[240px_repeat(7,64px)_120px_180px] md:grid border-b bg-secondary text-center text-sm font-semibold text-muted-foreground">
      <div className="sticky left-0 z-40 flex min-h-[64px] items-center bg-secondary px-3 text-left">
        Неделя · {formatPlannerDay(weekDates[0] ?? today)} —{" "}
        {formatPlannerDay(weekDates[6] ?? today)}
      </div>
      {weekDates.map((date, index) => (
        <div
          key={date}
          className={`flex min-h-[64px] flex-col items-center justify-center gap-1 border-l ${date === today ? "bg-primary text-primary-foreground" : ""}`}
        >
          <span>{getPlannerDayName(index)}</span>
          <strong>{date.slice(8)}</strong>
        </div>
      ))}
      <div className="flex min-h-[64px] items-center justify-center border-l">Темп</div>
      <div className="flex min-h-[64px] items-center justify-center border-l">Быстрый ввод</div>
    </div>
  );
}
