import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical } from "lucide-react";
import type { ProgressGoal } from "@/shared/api";
import {
  type CadencePeriod,
  formatEntryValue,
  formatFactDate,
  getEntry,
  getFactAccessibleName,
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
  onManage?: (goal: PlanGoal) => void;
  mobileDate?: string;
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
  onManage,
  mobileDate,
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
  const mobileEntry = mobileDate ? getEntry(goal, mobileDate) : undefined;

  return (
    <div
      ref={ref}
      className={`grid grid-cols-1 md:grid-cols-[240px_repeat(7,64px)_120px_180px] border-b bg-card last:border-b-0 ${isDragging ? "z-10 opacity-60 shadow-lg" : ""}`}
      data-goal-id={goal.id}
    >
      <div className="relative flex min-h-[88px] min-w-0 items-center gap-2 bg-card px-3 py-3 md:sticky md:left-0 md:z-10 md:border-r">
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
          {onManage ? (
            <button
              type="button"
              className="block w-full break-words rounded text-left text-sm font-bold hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onManage(goal)}
              aria-label={`Изменить цель «${goal.title}»`}
            >
              {goal.title}
            </button>
          ) : (
            <strong className="block break-words text-sm font-bold">{goal.title}</strong>
          )}
          <span className="mt-1 block break-words text-sm text-muted-foreground">
            {getGoalMeta(goal)}
          </span>
        </span>
      </div>
      {weekDates.map((date) => {
        const entry = getEntry(goal, date);
        const inMonth = date.startsWith(`${month}-`);
        return (
          <button
            key={date}
            type="button"
            disabled={!inMonth}
            onClick={() => onSelect(goal, date)}
            data-entry-date={date}
            aria-pressed={selection?.goalId === goal.id && selection.date === date}
            className={`hidden min-h-[88px] flex-col items-center justify-center gap-1 border-r text-sm md:flex transition-colors ${
              !inMonth
                ? "cursor-not-allowed bg-muted/50 text-muted-foreground/60"
                : "hover:bg-primary-soft"
            } ${date === today || (selection?.goalId === goal.id && selection.date === date) ? "bg-primary-soft" : ""} ${selection?.goalId === goal.id && selection.date === date ? "ring-2 ring-inset ring-primary" : ""}`}
            aria-label={getFactAccessibleName(goal, date, today, month)}
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
      <div className="hidden md:block">
        <PlanTempo
          goal={goal}
          month={month}
          today={today}
          weekDates={weekDates}
          progress={progress}
          state={progressState}
        />
      </div>
      <div className="hidden md:block">
        <QuickFactInput
          goal={goal}
          month={month}
          today={today}
          onOpenInspector={(date) => onSelect(goal, date)}
        />
      </div>
      <div className="space-y-2 border-t px-4 py-3 md:hidden">
        <p className="text-sm text-muted-foreground">
          {mobileDate ? formatFactDate(mobileDate) : "Выберите дату над списком целей"}
        </p>
        {mobileDate && (
          <p
            className={
              mobileEntry?.met ? "text-sm font-bold text-success" : "text-sm text-muted-foreground"
            }
          >
            {mobileEntry
              ? `${formatEntryValue(goal, mobileEntry) || "Не отмечено"} · ${mobileEntry.met ? "Условие выполнено ✓" : "Условие не выполнено"}`
              : "Результат не записан"}
          </p>
        )}
        <button
          type="button"
          disabled={!mobileDate}
          onClick={() => {
            if (mobileDate) onSelect(goal, mobileDate);
          }}
          className="min-h-11 w-full rounded-lg border px-3 text-sm font-semibold text-primary disabled:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            mobileDate
              ? getFactAccessibleName(goal, mobileDate, today, month)
              : `Выберите дату для цели «${goal.title}»`
          }
        >
          Открыть результат
        </button>
      </div>
    </div>
  );
}
