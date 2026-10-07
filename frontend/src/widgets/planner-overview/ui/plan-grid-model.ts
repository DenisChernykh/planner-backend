import type { GetApiPlansMonth200GoalsItem } from "@/shared/api";

import type { CadencePeriod } from "../model/plan-model";

export type PlanGridProps = {
  month: string;
  today: string;
  weekDates: string[];
  goals: GetApiPlansMonth200GoalsItem[];
  onSelect: (goal: GetApiPlansMonth200GoalsItem, date: string) => void;
  selection?: { goalId: string; date: string };
};

export const planSections: Array<{ cadence: CadencePeriod; label: string; hint: string }> = [
  { cadence: "day", label: "Каждый день", hint: "Отмечайте значение за конкретную дату" },
  { cadence: "week", label: "За неделю", hint: "Цель считается в пределах недели" },
  { cadence: "month", label: "За месяц", hint: "Цель накапливается в течение месяца" },
];

export function reorderGoals(
  goals: GetApiPlansMonth200GoalsItem[],
  cadence: CadencePeriod,
  from: number,
  to: number,
) {
  const group = goals.filter((goal) => goal.cadence.period === cadence);
  const next = [...group];
  const [moved] = next.splice(from, 1);
  if (!moved) return goals;
  next.splice(to, 0, moved);
  let position = 0;
  return goals.map((goal) => {
    if (goal.cadence.period !== cadence) return goal;
    const replacement = next[position];
    position += 1;
    return replacement ?? goal;
  });
}
