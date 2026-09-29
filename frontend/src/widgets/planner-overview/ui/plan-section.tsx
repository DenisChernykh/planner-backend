import { CalendarDays } from "lucide-react";
import type { CadencePeriod } from "../model/plan-model";
import { GoalRow } from "./goal-row";
import type { PlanGridProps } from "./plan-grid-model";

type PlanSectionProps = PlanGridProps & { cadence: CadencePeriod; label: string; hint: string };

export function PlanSection({
  cadence,
  label,
  hint,
  goals,
  month,
  today,
  weekDates,
  onSelect,
}: PlanSectionProps) {
  const sectionGoals = goals.filter((goal) => goal.cadence.period === cadence);
  if (sectionGoals.length === 0) return null;
  return (
    <section aria-labelledby={`${cadence}-section`}>
      <div className="flex items-center gap-2 border-y bg-secondary px-3 py-2 text-xs">
        <CalendarDays className="size-3.5 text-primary" aria-hidden="true" />
        <h2 id={`${cadence}-section`} className="font-bold">
          {label}
        </h2>
        <span className="text-muted-foreground">{hint}</span>
      </div>
      {sectionGoals.map((goal, index) => (
        <GoalRow
          key={goal.id}
          goal={goal}
          index={index}
          cadence={cadence}
          month={month}
          today={today}
          weekDates={weekDates}
          onSelect={onSelect}
        />
      ))}
    </section>
  );
}
