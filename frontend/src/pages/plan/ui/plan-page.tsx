import { useParams } from "react-router";

import { PlanOverview } from "@/widgets/planner-overview";
import { PlannerShell } from "@/widgets/planner-shell";

export function PlanPage() {
  const month = useParams().month as string;

  return (
    <PlannerShell month={month}>
      <PlanOverview month={month} />
    </PlannerShell>
  );
}
