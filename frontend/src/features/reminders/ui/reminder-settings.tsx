import { Link } from "react-router";
import { useGetApiRemindersGoalsMonth, useGetApiRemindersSettings } from "@/shared/api";
import { addPlannerMonth } from "@/shared/lib/planner-calendar";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { Button, buttonVariants } from "@/shared/ui";
import { GeneralSettings } from "./general-settings";
import { GoalReminder } from "./goal-reminder";
import { TelegramConnection } from "./telegram-connection";

export function ReminderSettings({ month }: { month: string }) {
  const settings = useGetApiRemindersSettings({ query: { refetchOnWindowFocus: true } });
  const goals = useGetApiRemindersGoalsMonth({ month });
  if (settings.isPending || goals.isPending)
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        Загружаем настройки…
      </p>
    );
  if (!settings.data || !goals.data)
    return (
      <div className="space-y-3 p-6">
        <p role="alert">Не удалось загрузить напоминания.</p>
        <Button
          onClick={() => {
            void settings.refetch();
            void goals.refetch();
          }}
        >
          Повторить
        </Button>
      </div>
    );
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-7 sm:px-8">
      <TelegramConnection state={settings.data} />
      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <GeneralSettings key={settings.data.settings.ownerId} initial={settings.data.settings} />
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">Цели · {formatPlannerMonth(month)}</h2>
          <div className="flex gap-2">
            <Link
              aria-label="Предыдущий месяц"
              className={buttonVariants({ variant: "outline", size: "sm" })}
              to={`/plans/${addPlannerMonth(month, -1)}/reminders`}
            >
              ←
            </Link>
            <Link
              aria-label="Следующий месяц"
              className={buttonVariants({ variant: "outline", size: "sm" })}
              to={`/plans/${addPlannerMonth(month, 1)}/reminders`}
            >
              →
            </Link>
          </div>
        </div>
        {!goals.data.goals.length && (
          <p className="text-sm text-muted-foreground">
            В этом месяце пока нет целей. Добавьте их в плане, затем настройте напоминания.
          </p>
        )}
        {goals.data.goals.map((goal) => (
          <GoalReminder key={goal.goalId} goal={goal} month={month} />
        ))}
      </section>
    </div>
  );
}
