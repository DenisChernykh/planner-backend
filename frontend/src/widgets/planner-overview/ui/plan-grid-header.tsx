import { formatPlannerDay, getPlannerDayName } from "@/shared/lib/planner-calendar";

export function PlanGridHeader({ weekDates, today }: { weekDates: string[]; today: string }) {
  return (
    <div className="grid grid-cols-[minmax(220px,1fr)_repeat(7,56px)_120px_128px] border-b bg-secondary text-center text-[0.68rem] font-semibold text-muted-foreground">
      <div className="flex min-h-[64px] items-center px-3 text-left">
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
