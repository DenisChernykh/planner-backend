import { useParams, useSearchParams } from "react-router";
import { ReminderSettings } from "@/features/reminders";
import { PlannerPageHeader, PlannerShell } from "@/widgets/planner-shell";

export function RemindersPage() {
  const month = useParams().month as string;
  const [params] = useSearchParams();
  const reports = params.get("tab") === "reports";
  return (
    <PlannerShell month={month}>
      <PlannerPageHeader
        eyebrow="Личный план"
        title={reports ? "Отчёты о прогрессе" : "Напоминания и отчёты"}
        description={
          reports
            ? "Короткие итоги недели в Telegram — по выбранным целям."
            : "Вопросы в подходящее время и запись ответов прямо в Telegram."
        }
        backTo={`/plans/${month}`}
        backLabel="К плану"
      />
      <ReminderSettings month={month} />
    </PlannerShell>
  );
}
