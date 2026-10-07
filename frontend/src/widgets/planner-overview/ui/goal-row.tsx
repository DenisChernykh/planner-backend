import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";
import type { ProgressGoal } from "@/shared/api";
import {
  clampPlannerDate,
  getPlannerDayName,
  isPlannerDateEditable,
} from "@/shared/lib/planner-calendar";
import {
  type CadencePeriod,
  formatEntryValue,
  getEntry,
  getGoalMeta,
  getTrackingLabel,
  type PlanGoal,
} from "../model/plan-model";
import { PlanTempo } from "./plan-tempo";
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
  selection?: { goalId: string; date: string };
  progress?: ProgressGoal;
  progressState: "embedded" | "pending" | "error" | "ready";
};

export function GoalRow({
  goal,
  index,
  cadence,
  month,
  today,
  weekDates,
  onSelect,
  selection,
  progress,
  progressState,
}: GoalRowProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: goal.id,
    index,
    group: cadence,
    type: cadence,
    accept: cadence,
    data: { cadence, title: goal.title },
  });
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
            data-entry-date={date}
            aria-pressed={selection?.goalId === goal.id && selection.date === date}
            className={`flex min-h-[72px] flex-col items-center justify-center gap-1 border-r text-xs transition-colors ${
              !inMonth
                ? "cursor-not-allowed bg-muted/50 text-muted-foreground/60"
                : "hover:bg-primary-soft"
            } ${date === today || (selection?.goalId === goal.id && selection.date === date) ? "bg-primary-soft" : ""} ${selection?.goalId === goal.id && selection.date === date ? "ring-2 ring-inset ring-primary" : ""}`}
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
      <PlanTempo
        goal={goal}
        month={month}
        today={today}
        weekDates={weekDates}
        progress={progress}
        state={progressState}
      />
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
