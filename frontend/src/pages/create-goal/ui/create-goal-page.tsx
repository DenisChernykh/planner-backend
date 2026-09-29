import { useParams } from "react-router";

import { CreateGoalForm } from "@/features/create-goal";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { PlannerPageHeader, PlannerShell } from "@/widgets/planner-shell";

export function CreateGoalPage() {
  const month = useParams().month as string;

  return (
    <PlannerShell month={month}>
      <PlannerPageHeader
        eyebrow={`План · ${formatPlannerMonth(month)}`}
        title="Новая цель"
        description="Задайте способ учёта и ритм, по которому цель будет появляться в месячном плане."
        backTo={`/plans/${month}`}
        backLabel="К плану"
      />
      <CreateGoalForm month={month} />
    </PlannerShell>
  );
}
