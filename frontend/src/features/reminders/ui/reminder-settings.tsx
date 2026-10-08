import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Settings2 } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import type { ProgressReportInput, PutApiRemindersSettingsBody } from "@/shared/api";
import {
  putApiRemindersProgressReports,
  putApiRemindersSettings,
  useGetApiRemindersGoalsMonth,
  useGetApiRemindersProgressReports,
  useGetApiRemindersSettings,
} from "@/shared/api";
import { addPlannerMonth } from "@/shared/lib/planner-calendar";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { useAppRuntime } from "@/shared/lib/runtime";
import { Button, buttonVariants } from "@/shared/ui";
import { GeneralSettings } from "./general-settings";
import { GoalReminder } from "./goal-reminder";
import { ProgressReportSettings } from "./progress-report-settings";
import { TelegramConnection } from "./telegram-connection";

export function ReminderSettings({ month }: { month: string }) {
  const [params] = useSearchParams();
  const web = useAppRuntime() === "web";
  const reports = web && params.get("tab") === "reports";
  if (web && !params.has("tab")) return <MessageModes month={month} />;
  if (reports) return <ProgressReportSettings month={month} />;
  return (
    <>
      <nav
        className="flex flex-wrap gap-2 border-b bg-background px-5 pb-4 sm:px-8"
        aria-label="Тип сообщений"
      >
        {web && (
          <Link to={`/plans/${month}/reminders`} className={buttonVariants({ variant: "outline" })}>
            Все сообщения
          </Link>
        )}
        <Link
          to="?tab=reminders"
          className={buttonVariants({ variant: reports ? "outline" : "default" })}
        >
          Напоминания о заполнении
        </Link>
        {web && (
          <Link
            to="?tab=reports"
            className={buttonVariants({ variant: reports ? "default" : "outline" })}
          >
            Отчёты о прогрессе
          </Link>
        )}
      </nav>
      <ReminderQuestions month={month} />
    </>
  );
}
function MessageModes({ month }: { month: string }) {
  const general = useGetApiRemindersSettings();
  const reports = useGetApiRemindersProgressReports({ month });
  const goals = useGetApiRemindersGoalsMonth({ month });
  const client = useQueryClient();
  const invalidate = () =>
    client.invalidateQueries({
      predicate: (query) => /\/api\/reminders/u.test(String(query.queryKey[0])),
    });
  const questionSave = useMutation({
    mutationFn: (input: PutApiRemindersSettingsBody) => putApiRemindersSettings(input),
    onSuccess: invalidate,
  });
  const reportSave = useMutation({
    mutationFn: (input: ProgressReportInput) => putApiRemindersProgressReports(input),
    onSuccess: invalidate,
  });
  if (general.isPending || reports.isPending || goals.isPending)
    return (
      <p role="status" className="p-5">
        Загружаем настройки сообщений…
      </p>
    );
  if (!general.data || !reports.data || !goals.data)
    return (
      <div className="space-y-3 p-5">
        <p role="alert">Не удалось загрузить настройки сообщений.</p>
        <Button
          onClick={() => {
            void general.refetch();
            void reports.refetch();
            void goals.refetch();
          }}
        >
          Повторить
        </Button>
      </div>
    );
  const state = reports.data;
  const selected = state.goals.filter((goal) => goal.included).length;
  const connected = general.data.connection === "active" && general.data.botAvailable;
  const dateTime = (at: number) =>
    new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: state.timeZone,
    }).format(at);
  const switchClass =
    "relative h-6 w-11 shrink-0 appearance-none rounded-full bg-muted transition-colors checked:bg-primary before:absolute before:top-0.5 before:left-0.5 before:size-5 before:rounded-full before:bg-card before:shadow-sm checked:before:translate-x-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50";
  return (
    <div className="space-y-5 px-5 py-6 sm:px-8">
      <div
        className={`rounded-xl p-4 text-sm ${connected ? "bg-success-soft" : "bg-primary-soft"}`}
      >
        {connected
          ? "Telegram подключён · личный чат с ботом Ритм"
          : "Подключите Telegram, чтобы получать сообщения"}
      </div>
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex justify-between gap-3">
          <h2 className="font-bold">Напоминания о заполнении</h2>
          <input
            type="checkbox"
            role="switch"
            aria-checked={general.data.settings.enabled}
            aria-label="Напоминания о заполнении"
            className={switchClass}
            checked={general.data.settings.enabled}
            disabled={questionSave.isPending || (!connected && !general.data.settings.enabled)}
            onChange={(event) => {
              const settings = general.data?.settings;
              if (settings)
                questionSave.mutate({
                  enabled: event.target.checked,
                  timeZone: settings.timeZone,
                  quietStart: settings.quietStart,
                  quietEnd: settings.quietEnd,
                  eveningTime: settings.eveningTime,
                });
            }}
          />
        </div>
        <p className="text-sm">
          {general.data.settings.enabled ? "Включены" : "Выключены"} · целей с напоминаниями:{" "}
          {goals.data.goals.filter((goal) => goal.mode !== "off").length}
        </p>
        <p className="text-xs text-muted-foreground">
          Вопросы о незаполненных целях и вечерний сбор записей.
        </p>
        {general.data.settings.enabled && general.data.settings.nextEveningAt && (
          <p className="text-sm">
            Ближайший вечерний сбор: {dateTime(general.data.settings.nextEveningAt)}
          </p>
        )}
        <Link to="?tab=reminders" className={buttonVariants({ variant: "outline" })}>
          Настроить напоминания <Settings2 />
        </Link>
        {questionSave.isError && (
          <p role="alert" className="text-sm text-destructive">
            Не удалось изменить напоминания. Повторите попытку.
          </p>
        )}
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex justify-between gap-3">
          <h2 className="font-bold">Отчёты о прогрессе</h2>
          <input
            type="checkbox"
            role="switch"
            aria-checked={state.settings.enabled}
            aria-label="Отчёты о прогрессе"
            className={switchClass}
            checked={state.settings.enabled}
            disabled={
              reportSave.isPending || (!state.settings.enabled && (!connected || selected === 0))
            }
            onChange={(event) =>
              reportSave.mutate({
                month,
                enabled: event.target.checked,
                wednesdayTime: state.settings.wednesdayTime,
                sundayTime: state.settings.sundayTime,
                startsOn: state.startsOn,
                goals: state.goals.map(({ goalId, included }) => ({ goalId, included })),
              })
            }
          />
        </div>
        <p className="text-sm">
          {state.settings.enabled
            ? state.state === "ready"
              ? "Включены"
              : "Приостановлены"
            : "Выключены"}{" "}
          · среда {state.settings.wednesdayTime} · воскресенье {state.settings.sundayTime}
        </p>
        <p className="text-sm">
          Выбрано целей: {selected} ·{" "}
          {state.startsOn ? `учитываем с ${state.startsOn}` : "учитываем всю историю"}
        </p>
        {state.nextRuns[0] && (
          <div className="flex gap-3 rounded-lg bg-muted p-4">
            <CalendarClock className="size-4 shrink-0 text-primary" />
            <span className="text-sm">
              Ближайший отчёт: {dateTime(state.nextRuns[0].sendAt)}
              <span className="mt-1 block text-xs text-muted-foreground">{state.timeZone}</span>
            </span>
          </div>
        )}
        {!selected && (
          <p className="text-xs text-muted-foreground">
            Выберите цели в настройках отчётов, чтобы включить рассылку.
          </p>
        )}
        <Link to="?tab=reports" className={buttonVariants()}>
          Настроить отчёты <Settings2 />
        </Link>
        {reportSave.isError && (
          <p role="alert" className="text-sm text-destructive">
            Не удалось изменить отчёты. Повторите попытку.
          </p>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        Отчёты приходят и при выключенных напоминаниях о заполнении.
      </p>
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-bold">Telegram и время</h2>
        <p className="text-sm">
          Тихие часы: {state.quietStart}–{state.quietEnd} · {state.timeZone}
        </p>
        <Link to="?tab=reminders#telegram" className={buttonVariants({ variant: "outline" })}>
          Настройки подключения
        </Link>
        <p className="text-xs text-muted-foreground">
          Отключение Telegram-чата остановит и напоминания, и отчёты.
        </p>
      </section>
    </div>
  );
}
function ReminderQuestions({ month }: { month: string }) {
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
              to={`/plans/${addPlannerMonth(month, -1)}/reminders?tab=reminders`}
            >
              ←
            </Link>
            <Link
              aria-label="Следующий месяц"
              className={buttonVariants({ variant: "outline", size: "sm" })}
              to={`/plans/${addPlannerMonth(month, 1)}/reminders?tab=reminders`}
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
