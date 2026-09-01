import { useParams } from "react-router";

import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { PlanOverview } from "@/widgets/planner-overview";
import { PlannerPageHeader, PlannerShell } from "@/widgets/planner-shell";

export function PlanPage() {
  const month = useParams().month as string;

  return (
    <PlannerShell month={month}>
      <PlannerPageHeader
        eyebrow="Месячный план"
        title={formatPlannerMonth(month)}
        description="Цели месяца появятся здесь после создания. Таблица плана будет добавлена следующим этапом."
      />
      <PlanOverview month={month} />
    </PlannerShell>
  );
}
