import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  addPlannerDays,
  getPlannerMonthEnd,
  getPlannerMonthStart,
} from "@/shared/lib/planner-calendar";
import { Button, Input } from "@/shared/ui";

type FactDateControlsProps = {
  date: string;
  month: string;
  onDateChange: (date: string) => void;
};

export function FactDateControls({ date, month, onDateChange }: FactDateControlsProps) {
  const firstDate = getPlannerMonthStart(month);
  const lastDate = getPlannerMonthEnd(month);
  return (
    <section className="space-y-2 border-b bg-secondary p-4">
      <label
        className="text-[0.65rem] font-bold tracking-wide text-muted-foreground"
        htmlFor="inspector-date"
      >
        ДАТА
      </label>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          className="size-11 rounded-lg lg:size-7 lg:rounded-none"
          disabled={date <= firstDate}
          onClick={() => onDateChange(addPlannerDays(date, -1))}
          aria-label="Предыдущий день"
        >
          <ChevronLeft />
        </Button>
        <Input
          id="inspector-date"
          type="date"
          min={firstDate}
          max={lastDate}
          value={date}
          onChange={(event) => {
            if (event.target.value) onDateChange(event.target.value);
          }}
          className="h-11 flex-1 rounded-lg text-base lg:h-8 lg:rounded-none lg:text-xs"
        />
        <Button
          variant="outline"
          size="icon-sm"
          className="size-11 rounded-lg lg:size-7 lg:rounded-none"
          disabled={date >= lastDate}
          onClick={() => onDateChange(addPlannerDays(date, 1))}
          aria-label="Следующий день"
        >
          <ChevronRight />
        </Button>
      </div>
    </section>
  );
}
