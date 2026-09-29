import { useParams } from "react-router";

import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { TrashOverview } from "@/widgets/planner-overview";
import { PlannerPageHeader, PlannerShell } from "@/widgets/planner-shell";

export function TrashPage() {
  const month = useParams().month as string;

  return (
    <PlannerShell month={month}>
      <PlannerPageHeader
        eyebrow="Корзина"
        title={`Удалённые цели · ${formatPlannerMonth(month)}`}
        description="Восстановление и окончательное удаление появятся вместе с полноценным экраном корзины."
        backTo={`/plans/${month}`}
        backLabel="К плану"
      />
      <TrashOverview month={month} />
    </PlannerShell>
  );
}
