import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import {
  type PostApiRemindersProgressReportsPreviewBody,
  type ProgressReportInput,
  type ProgressReportState,
  postApiRemindersProgressReportsPreview,
  putApiRemindersProgressReports,
  useGetApiRemindersProgressReports,
  useGetApiRemindersSettings,
} from "@/shared/api";
import { addPlannerMonth } from "@/shared/lib/planner-calendar";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { Button, buttonVariants, TextField } from "@/shared/ui";

export function ProgressReportSettings({ month }: { month: string }) {
  const query = useGetApiRemindersProgressReports(
    { month },
    { query: { refetchOnMount: "always" } },
  );
  const general = useGetApiRemindersSettings();
  if (query.isPending)
    return (
      <p role="status" className="p-5 text-sm text-muted-foreground">
        Загружаем настройки отчётов…
      </p>
    );
  if (query.isError || !query.data)
    return (
      <div className="space-y-4 p-5">
        <p role="alert">Не удалось загрузить настройки отчётов.</p>
        <Button onClick={() => query.refetch()}>Повторить</Button>
      </div>
    );
  return (
    <div className="min-h-svh bg-background px-5 py-6 sm:px-8">
      {(general.data?.deliveryIssues ?? 0) > 0 && (
        <p role="status" className="mb-5 rounded-lg border bg-card p-4 text-sm">
          За последние сутки есть сообщения с ошибкой или неподтверждённой доставкой:{" "}
          {general.data?.deliveryIssues}. Новые отчёты будут сформированы по расписанию.
        </p>
      )}
      <ReportForm key={month} month={month} state={query.data} />
    </div>
  );
}
function ReportForm({ month, state }: { month: string; state: ProgressReportState }) {
  const [draft, setDraft] = useState<ProgressReportInput>({
    month,
    enabled: state.settings.enabled,
    wednesdayTime: state.settings.wednesdayTime,
    sundayTime: state.settings.sundayTime,
    startsOn: state.startsOn,
    goals: state.goals.map(({ goalId, included }) => ({ goalId, included })),
  });
  const [slot, setSlot] = useState<"wed" | "sun">("wed");
  const [search, setSearch] = useState("");
  const client = useQueryClient();
  const payload: ProgressReportInput = {
    ...draft,
    goals: state.goals.map((goal) => ({
      goalId: goal.goalId,
      included: draft.goals.find((item) => item.goalId === goal.goalId)?.included ?? false,
    })),
  };
  const save = useMutation({
    mutationFn: (data: ProgressReportInput) => putApiRemindersProgressReports(data),
    onSuccess: async () => {
      await client.invalidateQueries({
        predicate: (query) =>
          /\/api\/(?:progress|plans|reminders)/u.test(String(query.queryKey[0])),
      });
    },
  });
  const preview = useMutation({
    mutationFn: (data: PostApiRemindersProgressReportsPreviewBody) =>
      postApiRemindersProgressReportsPreview(data),
  });
  const previewCurrent = JSON.stringify(preview.variables) === JSON.stringify({ ...payload, slot });
  const change = (patch: Partial<ProgressReportInput>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    save.reset();
    preview.reset();
  };
  const selected = payload.goals.filter((goal) => goal.included).length;
  const connected = state.connection === "active" && state.botAvailable;
  const dateTime = (value: number) =>
    new Intl.DateTimeFormat("ru-RU", {
      weekday: "short",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: state.timeZone,
    }).format(value);
  const savedRuns = save.data?.nextRuns ?? state.nextRuns;
  return (
    <form
      className="space-y-5 [&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-lg [&_[data-slot=input]]:h-11 [&_[data-slot=input]]:rounded-lg"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(payload);
      }}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 text-sm ${connected ? "bg-success-soft" : "bg-primary-soft"}`}
      >
        <p className="flex min-w-0 items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          {connected
            ? "Telegram подключён · отчёты придут в личный чат с ботом"
            : "Подключите личный чат Telegram, чтобы включить отчёты"}
        </p>
        <Link
          className={`${buttonVariants({ variant: "outline", size: "sm" })} rounded-lg`}
          to={`/plans/${month}/reminders?tab=reminders#telegram`}
        >
          Подключение
        </Link>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <section className="space-y-5 rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold">Еженедельные отчёты</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  aria-label="Получать отчёты"
                  checked={draft.enabled}
                  disabled={save.isPending || (!connected && !draft.enabled)}
                  onChange={(event) => change({ enabled: event.target.checked })}
                />
                <span className="text-xs">Получать</span>
              </label>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              В среду — промежуточный итог. В воскресенье — итог недели на момент отправки.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Среда · понедельник–среда"
                type="time"
                required
                value={draft.wednesdayTime}
                disabled={save.isPending}
                onChange={(event) => change({ wednesdayTime: event.target.value })}
              />
              <TextField
                label="Воскресенье · вся неделя"
                type="time"
                required
                value={draft.sundayTime}
                disabled={save.isPending}
                onChange={(event) => change({ sundayTime: event.target.value })}
              />
            </div>
            <p className="flex flex-wrap justify-between gap-2 text-xs">
              <span>{state.timeZone}</span>
              <Link
                className="text-primary underline underline-offset-4"
                to={`/plans/${month}/reminders?tab=reminders`}
              >
                Изменить часовой пояс
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              Тихие часы: {state.quietStart}–{state.quietEnd}. В это время отчёт дождётся их
              окончания, сохранив исходную неделю.
            </p>
          </section>
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <TextField
              label="Учитывать прогресс с"
              type="date"
              value={draft.startsOn ?? ""}
              disabled={save.isPending}
              onChange={(event) => change({ startsOn: event.target.value || null })}
              description="Одна дата для всех целей, графиков и отчётов. Более ранние записи сохранятся в плане."
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => change({ startsOn: null })}
            >
              Учитывать всю историю
            </Button>
          </section>
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold">Какие цели включать</h2>
              <span className="text-xs text-muted-foreground">
                {selected} из {state.goals.length}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Link
                aria-label="Предыдущий месяц отчётов"
                className={buttonVariants({ variant: "outline", size: "sm" })}
                to={`/plans/${addPlannerMonth(month, -1)}/reminders?tab=reports`}
              >
                ←
              </Link>
              <span className="text-xs text-muted-foreground">{formatPlannerMonth(month)}</span>
              <Link
                aria-label="Следующий месяц отчётов"
                className={buttonVariants({ variant: "outline", size: "sm" })}
                to={`/plans/${addPlannerMonth(month, 1)}/reminders?tab=reports`}
              >
                →
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              Состав отчёта не меняет статистику в приложении.
            </p>
            <TextField
              label="Поиск целей для отчёта"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() =>
                  change({
                    goals: state.goals.map((goal) => ({ goalId: goal.goalId, included: true })),
                  })
                }
              >
                Выбрать все
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() =>
                  change({
                    goals: state.goals.map((goal) => ({ goalId: goal.goalId, included: false })),
                  })
                }
              >
                Снять все
              </Button>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y">
              {state.goals
                .filter((goal) =>
                  goal.title.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")),
                )
                .map((goal) => (
                  <label
                    key={goal.goalId}
                    className="flex min-h-12 items-center gap-3 py-3 text-sm"
                  >
                    <input
                      className="size-4 shrink-0 accent-primary"
                      type="checkbox"
                      disabled={save.isPending}
                      checked={
                        payload.goals.find((item) => item.goalId === goal.goalId)?.included ?? false
                      }
                      onChange={(event) =>
                        change({
                          goals: payload.goals.map((item) =>
                            item.goalId === goal.goalId
                              ? { ...item, included: event.target.checked }
                              : item,
                          ),
                        })
                      }
                    />
                    <span className="min-w-0 break-words">{goal.title}</span>
                  </label>
                ))}
              {!state.goals.some((goal) =>
                goal.title.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")),
              ) && (
                <p className="py-4 text-sm text-muted-foreground">
                  {state.goals.length ? "Поиск не дал результатов" : "В этом месяце пока нет целей"}
                </p>
              )}
            </div>
            {selected === 0 && (
              <p className="text-xs text-muted-foreground">
                Выберите хотя бы одну цель, чтобы включить отчёты.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Новые цели можно добавить сюда после создания. При автоматическом переносе в следующий
              месяц выбор сохранится.
            </p>
          </section>
          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              Не удалось сохранить настройки. Черновик сохранён в форме; повторите попытку.
            </p>
          )}
          {save.isSuccess && (
            <p role="status" className="text-sm text-success">
              Настройки отчётов сохранены
            </p>
          )}
          <Button
            type="submit"
            disabled={save.isPending || (draft.enabled && (!connected || selected === 0))}
          >
            {save.isPending ? "Сохраняем…" : "Сохранить настройки отчётов"}
          </Button>
        </div>
        <div className="space-y-5">
          <section className="space-y-4">
            <h2 className="font-bold">Предпросмотр</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={slot === "wed" ? "default" : "outline"}
                size="sm"
                aria-pressed={slot === "wed"}
                onClick={() => {
                  setSlot("wed");
                  preview.reset();
                }}
              >
                Среда
              </Button>
              <Button
                type="button"
                variant={slot === "sun" ? "default" : "outline"}
                size="sm"
                aria-pressed={slot === "sun"}
                onClick={() => {
                  setSlot("sun");
                  preview.reset();
                }}
              >
                Воскресенье
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={preview.isPending}
                onClick={() => preview.mutate({ ...payload, slot })}
              >
                {preview.isPending ? "Формируем…" : "Показать предпросмотр"}
              </Button>
            </div>
            <div className="space-y-4 rounded-2xl bg-secondary p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Send className="size-5" />
                </span>
                <div>
                  <strong className="text-sm">Ритм</strong>
                  <p className="text-xs text-muted-foreground">бот</p>
                </div>
              </div>
              {preview.data && previewCurrent ? (
                preview.data.message ? (
                  <>
                    <div className="rounded-xl bg-card p-5">
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {preview.data.message.text}
                      </p>
                    </div>
                    {preview.data.message.buttons?.flat().map((button) => (
                      <a
                        key={button.text}
                        href={button.url}
                        className={`${buttonVariants({ variant: "outline" })} w-full rounded-lg whitespace-normal text-center`}
                      >
                        {button.text}
                      </a>
                    ))}
                  </>
                ) : (
                  <p className="rounded-xl bg-card p-5 text-sm">
                    {preview.data.reason === "future-start"
                      ? "Учёт начнётся в будущем. До этой даты сообщения не формируются."
                      : "Выберите цели, чтобы сформировать предпросмотр."}
                  </p>
                )
              ) : (
                <p className="rounded-xl bg-card p-5 text-sm text-muted-foreground">
                  Выберите цели и покажите предпросмотр будущего отчёта.
                </p>
              )}
            </div>
            {preview.isError && (
              <p role="alert" className="text-sm text-destructive">
                Не удалось сформировать предпросмотр. Повторите попытку.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Предпросмотр использует черновик и ничего не отправляет. Настройки применятся после
              сохранения.
            </p>
          </section>
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-bold">Напоминания работают отдельно</h2>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Этот переключатель управляет итогами недели. Напоминания о заполнении остаются в своих
              настройках.
            </p>
          </section>
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-bold">Ближайшие отправки</h2>
            {savedRuns.map((run) => (
              <p key={run.slot} className="mt-3 text-sm">
                {dateTime(run.sendAt)}
                {run.sendAt !== run.scheduledAt && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Перенос из-за тихих часов · отчёт за {run.reportDate}
                  </span>
                )}
              </p>
            ))}
            {!savedRuns.length && (
              <p className="mt-3 text-xs text-muted-foreground">
                {state.state === "future-start"
                  ? "Отправка начнётся после даты начала учёта."
                  : state.state === "no-goals"
                    ? "Выберите цели для отчёта."
                    : "Расписание появится после подключения Telegram и сохранения включённых отчётов."}
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              По сохранённым настройкам · {state.timeZone}
            </p>
          </section>
        </div>
      </div>
    </form>
  );
}
