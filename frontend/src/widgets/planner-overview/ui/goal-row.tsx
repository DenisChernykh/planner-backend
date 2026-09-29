import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";
import { useMemo } from "react";
import {
  clampPlannerDate,
  getPlannerDayName,
  isPlannerDateEditable,
} from "@/shared/lib/planner-calendar";
import {
  type CadencePeriod,
  clampProgress,
  formatEntryValue,
  getEntry,
  getGoalMeta,
  getProgress,
  getTrackingLabel,
  type PlanGoal,
} from "../model/plan-model";
import { QuickFactInput } from "./quick-fact-input";
import { trackingIconMap } from "./tracking-presentation";

type GoalRowProps = {
  goal: PlanGoal;
  index: number;
  cadence: CadencePeriod;
  month: string;
  today: string;
  weekDates: string[];
  onSelect: (goal: PlanGoal, date: string) => void;
};

export function GoalRow({ goal, index, cadence, month, today, weekDates, onSelect }: GoalRowProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: goal.id,
    index,
    group: cadence,
    type: cadence,
    accept: cadence,
    data: { cadence, title: goal.title },
  });
  const progress = useMemo(
    () => getProgress(goal, weekDates, month, today),
    [goal, weekDates, month, today],
  );
  const GoalIcon = trackingIconMap[goal.tracking.type];
  const factDate = clampPlannerDate(today, today, month);
  const factEntry = getEntry(goal, factDate);
  const quickFactKey = `${goal.id}-${factDate}-${String(factEntry?.value ?? "")}-${factEntry?.updatedAt ?? ""}`;

  return (
    <div
      ref={ref}
      className={`grid grid-cols-[minmax(220px,1fr)_repeat(7,56px)_120px_128px] border-b bg-card last:border-b-0 ${isDragging ? "z-10 opacity-60 shadow-lg" : ""}`}
      data-goal-id={goal.id}
    >
      <div className="flex min-h-[72px] items-center gap-2 border-r px-3">
        <button
          ref={handleRef}
          type="button"
          className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          aria-label={`Переместить цель «${goal.title}»`}
          title="Переместить цель"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
          <GoalIcon className="size-4" aria-hidden="true" />
          <span className="sr-only">{getTrackingLabel(goal.tracking.type)}</span>
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-xs font-bold">{goal.title}</strong>
          <span className="block truncate text-[0.68rem] text-muted-foreground">
            {getGoalMeta(goal)}
          </span>
        </span>
      </div>
      {weekDates.map((date, dateIndex) => {
        const entry = getEntry(goal, date);
        const inMonth = date.startsWith(`${month}-`);
        const editable = isPlannerDateEditable(date, today, month);
        return (
          <button
            key={date}
            type="button"
            disabled={!inMonth}
            onClick={() => onSelect(goal, date)}
            className={`flex min-h-[72px] flex-col items-center justify-center gap-1 border-r text-xs transition-colors ${
              !inMonth
                ? "cursor-not-allowed bg-muted/50 text-muted-foreground/60"
                : "hover:bg-primary-soft"
            } ${date === today ? "bg-primary-soft" : ""}`}
            aria-label={`${goal.title}, ${getPlannerDayName(dateIndex)} ${date.slice(8)}${editable ? "" : ", просмотр"}`}
          >
            <span className={entry?.met ? "font-bold text-success" : "text-muted-foreground"}>
              {formatEntryValue(goal, entry) || "—"}
            </span>
            <span
              className={`flex size-5 items-center justify-center rounded-full border ${entry?.met ? "border-success bg-success-soft text-success" : "border-border text-muted-foreground"}`}
            >
              {entry?.met ? "✓" : "·"}
            </span>
          </button>
        );
      })}
      <div className="flex min-h-[72px] flex-col justify-center gap-1.5 border-r px-3">
        <div className="flex items-center justify-between gap-2 text-xs font-bold text-primary">
          <span>
            {progress.value} / {progress.total}
          </span>
          <span className="text-[0.65rem] font-normal text-muted-foreground">{progress.label}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${clampProgress(progress.value, progress.total)}%` }}
          />
        </div>
      </div>
      <QuickFactInput
        key={quickFactKey}
        goal={goal}
        month={month}
        today={today}
        onOpenInspector={() => onSelect(goal, factDate)}
      />
    </div>
  );
}
