import { useParams } from "react-router";
import { ReminderSettings } from "@/features/reminders";
import { PlannerPageHeader, PlannerShell } from "@/widgets/planner-shell";

export function RemindersPage() {
  const month = useParams().month as string;
  return (
    <PlannerShell month={month}>
      <PlannerPageHeader
        eyebrow="Личный план"
        title="Напоминания"
        description="Вопросы в подходящее время и запись ответов прямо в Telegram."
        backTo={`/plans/${month}`}
        backLabel="К плану"
      />
      <ReminderSettings month={month} />
    </PlannerShell>
  );
}
