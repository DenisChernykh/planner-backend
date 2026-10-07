import { useParams } from "react-router";
import { PlannerShell } from "@/widgets/planner-shell";
import { ProgressView } from "@/widgets/progress";

export function ProgressPage() {
  const month = useParams().month as string;
  return (
    <PlannerShell month={month}>
      <ProgressView month={month} />
    </PlannerShell>
  );
}
