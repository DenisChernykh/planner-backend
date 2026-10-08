import type { GetApiPlansMonth200GoalsItem } from "@/shared/api";
import {
  formatPlannerDay,
  getPlannerWeekDates,
  getPlannerWeekStart,
  isPlannerDateInMonth,
} from "@/shared/lib/planner-calendar";
import { formatEntryValue, getEntry, getFactAccessibleName } from "../model/plan-model";

type FactWeekHistoryProps = {
  goal: GetApiPlansMonth200GoalsItem;
  date: string;
  month: string;
  today: string;
  onDateChange: (date: string) => void;
};

export function FactWeekHistory({ goal, date, month, today, onDateChange }: FactWeekHistoryProps) {
  const weekDates = getPlannerWeekDates(getPlannerWeekStart(date));
  return (
    <section className="space-y-3 border-b bg-secondary p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.65rem] font-bold tracking-wide text-muted-foreground">ЭТА НЕДЕЛЯ</h3>
        <span className="text-[0.65rem] text-muted-foreground">
          {formatPlannerDay(weekDates[0] ?? date)}
        </span>
      </div>
      {weekDates.map((item) => {
        const inMonth = isPlannerDateInMonth(item, month);
        const selected = item === date;
        const entry = getEntry(goal, item);
        return (
          <button
            key={item}
            type="button"
            disabled={!inMonth}
            aria-label={getFactAccessibleName(goal, item, today, month)}
            aria-pressed={selected}
            className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm ${selected ? "border-primary bg-primary-soft" : "bg-card"}`}
            onClick={() => onDateChange(item)}
          >
            <span>{formatPlannerDay(item)}</span>
            <span>{formatEntryValue(goal, entry) || "—"}</span>
          </button>
        );
      })}
    </section>
  );
}
