import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hash,
  Send,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import {
  type PostApiRemindersProgressReportsPreviewBody,
  type ProgressReportInput,
  type ProgressReportState,
  postApiRemindersProgressReportsPreview,
  putApiRemindersProgressReports,
  useGetApiRemindersProgressReports,
} from "@/shared/api";
import { useIsMobile } from "@/shared/lib/hooks";
import { addPlannerMonth, formatPlannerDay } from "@/shared/lib/planner-calendar";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { Button, buttonVariants, DateField, isCivilDate, TextField } from "@/shared/ui";

export function ProgressReportSettings({ month }: { month: string }) {
  const query = useGetApiRemindersProgressReports(
    { month },
    { query: { refetchOnMount: "always" } },
  );
  if (query.isPending)
    return (
      <div className="px-5 py-7 sm:px-8">
        <ReportHeader month={month} />
        <p role="status" className="text-sm text-muted-foreground">
          Загружаем настройки отчётов…
        </p>
      </div>
    );
  if (query.isError || !query.data)
    return (
      <div className="space-y-4 px-5 py-7 sm:px-8">
        <ReportHeader month={month} />
        <p role="alert">Не удалось загрузить настройки отчётов.</p>
        <Button onClick={() => query.refetch()}>Повторить</Button>
      </div>
    );
  return (
    <div className="min-h-svh bg-background px-5 py-7 sm:px-8">
      <ReportForm key={month} month={month} state={query.data} />
    </div>
  );
}
function ReportHeader({ children, month }: { children?: ReactNode; month: string }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link
          to={`/plans/${month}/progress`}
          className="mb-4 flex min-h-11 items-center gap-2 text-sm text-muted-foreground sm:hidden"
        >
          <ChevronLeft className="size-4" />
          Прогресс
        </Link>
        <h1 className="text-[26px] font-bold tracking-tight sm:text-[32px]">
          <span className="sm:hidden">Отчёты в Telegram</span>
          <span className="hidden sm:inline">Отчёты о прогрессе</span>
        </h1>
        <p className="mt-2 hidden text-sm text-muted-foreground sm:block">
          Короткие итоги недели в Telegram — по выбранным целям.
        </p>
      </div>
      {children}
    </header>
  );
}
function DeliveryNotice({ state }: { state: ProgressReportState }) {
  if (!state.delivery.retrying && !state.delivery.unknown && !state.delivery.failed) return null;
  return (
    <div className="space-y-3" role="status">
      {(state.delivery?.retrying ?? 0) > 0 && (
        <p className="rounded-xl bg-muted p-4 text-sm">
          Временная ошибка Telegram. Отчёты ожидают повторной попытки: {state.delivery.retrying}.
          Повторим автоматически в пределах суток от исходного времени.
        </p>
      )}
      {(state.delivery?.unknown ?? 0) > 0 && (
        <p className="rounded-xl bg-muted p-4 text-sm">
          Доставка не подтверждена: {state.delivery.unknown}. Telegram мог принять сообщение.
          Повторно этот отчёт не отправляем, чтобы избежать дубликата; следующий придёт по
          расписанию.
        </p>
      )}
      {(state.delivery?.failed ?? 0) > 0 && (
        <p className="rounded-xl bg-muted p-4 text-sm">
          Не удалось доставить отчёты: {state.delivery.failed}. Проверьте подключение Telegram.
          Следующие отчёты придут по расписанию.
        </p>
      )}
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const mobile = useIsMobile();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: state.timeZone }).format(new Date());
  const visible = state.goals.filter((goal) =>
    goal.title.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru")),
  );
  const validDate = draft.startsOn === null || isCivilDate(draft.startsOn);
  const validTime =
    /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(draft.wednesdayTime) &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(draft.sundayTime);
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
  const previewPanel = (
    <section className="space-y-4">
      {!mobile && <h2 className="font-bold">Предпросмотр</h2>}
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
          disabled={preview.isPending || !validDate || !validTime}
          onClick={() => preview.mutate({ ...payload, slot })}
        >
          {preview.isPending ? "Формируем…" : "Показать предпросмотр"}
        </Button>
      </div>
      <div className="space-y-4 rounded-2xl bg-primary-soft/50 p-4 sm:p-5">
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
                {preview.data.message.blocks ? (
                  <div className="space-y-5">
                    {preview.data.message.blocks.map((block) => {
                      const Icon = block.icon
                        ? {
                            check: CheckCircle2,
                            quantity: Hash,
                            scale: SlidersHorizontal,
                            time: Clock3,
                          }[block.icon]
                        : null;
                      return (
                        <section
                          key={block.id ?? block.title ?? block.lines[0]?.text}
                          className={
                            block.kind === "notice" ? "border-t pt-3 text-muted-foreground" : ""
                          }
                        >
                          {block.title && (
                            <h3
                              className={
                                block.kind === "header"
                                  ? "mb-3 text-lg font-bold"
                                  : "mb-2 text-sm font-semibold"
                              }
                            >
                              <span className="flex items-center gap-2">
                                {Icon && <Icon className="size-4 shrink-0 text-primary" />}
                                {block.icon
                                  ? block.title.replace(/^[✅📊🙂🕒]\s*/u, "")
                                  : block.title}
                              </span>
                            </h3>
                          )}
                          {block.lines.map((line) => (
                            <p
                              key={line.id ?? line.text}
                              className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${line.bold ? "font-semibold" : ""} ${/^[▰▱]/u.test(line.text) ? "text-primary" : ""}`}
                            >
                              {line.text}
                            </p>
                          ))}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {preview.data.message.text}
                  </p>
                )}
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
  );
  const forecastPanel = (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-sm font-bold">Ближайшие отправки</h2>
      {savedRuns.map((run) => (
        <p key={`${run.slot}-${run.reportDate}`} className="mt-3 text-sm">
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
  );
  const saveButton = (
    <Button
      type="submit"
      aria-label={save.isPending ? "Сохраняем…" : "Сохранить настройки отчётов"}
      disabled={
        save.isPending ||
        !validDate ||
        !validTime ||
        (draft.enabled && (!connected || selected === 0))
      }
    >
      {save.isPending ? "Сохраняем…" : "Сохранить"}
    </Button>
  );
  return (
    <form
      className="space-y-5 [&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-lg [&_[data-slot=input]]:h-11 [&_[data-slot=input]]:rounded-lg"
      onSubmit={(event) => {
        event.preventDefault();
        if (validDate && validTime) save.mutate(payload);
      }}
    >
      <ReportHeader month={month}>{!mobile && saveButton}</ReportHeader>
      <DeliveryNotice state={state} />
      <fieldset disabled={save.isPending} className="min-w-0 space-y-5">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 text-sm ${connected ? "bg-success-soft" : "bg-primary-soft"}`}
        >
          <p className="flex min-w-0 items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            {connected ? (
              <>
                <span className="sm:hidden">Telegram подключён</span>
                <span className="hidden sm:inline">
                  Telegram подключён · отчёты придут в личный чат с ботом
                </span>
              </>
            ) : (
              "Подключите личный чат Telegram, чтобы включить отчёты"
            )}
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
                    className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-muted transition-colors before:mt-0.5 before:ml-0.5 before:block before:size-5 before:rounded-full before:bg-card before:shadow-sm before:transition-transform checked:bg-primary checked:before:translate-x-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-50"
                    aria-label="Получать отчёты"
                    checked={draft.enabled}
                    disabled={save.isPending || (!connected && !draft.enabled)}
                    onChange={(event) => change({ enabled: event.target.checked })}
                  />
                </label>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                В среду — промежуточный итог. В воскресенье — итог недели на момент отправки.
              </p>
              <div className="space-y-4 [&_[data-slot=field]]:grid [&_[data-slot=field]]:grid-cols-[minmax(0,1fr)_128px] [&_[data-slot=field]]:items-center [&_[data-slot=field]]:gap-3">
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
              {!validTime && (
                <p role="alert" className="text-xs text-destructive">
                  Укажите время в формате ЧЧ:ММ, от 00:00 до 23:59.
                </p>
              )}
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
              <DateField
                label="Учитывать прогресс с"
                value={draft.startsOn ?? ""}
                today={today}
                disabled={save.isPending}
                onChange={(value) => change({ startsOn: value || null })}
                description="Одна дата для всех целей, графиков и отчётов. Более ранние записи сохранятся в плане."
              />
              {draft.startsOn && validDate && draft.startsOn > today && (
                <p className="rounded-lg bg-primary-soft p-3 text-xs">
                  Учёт начнётся {formatPlannerDay(draft.startsOn)} {draft.startsOn.slice(0, 4)}. До
                  этой даты отчёты не отправляются.
                </p>
              )}
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
                  <ChevronLeft />
                </Link>
                <span className="text-xs text-muted-foreground">{formatPlannerMonth(month)}</span>
                <Link
                  aria-label="Следующий месяц отчётов"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  to={`/plans/${addPlannerMonth(month, 1)}/reminders?tab=reports`}
                >
                  <ChevronRight />
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
                  disabled={!visible.length}
                  onClick={() =>
                    change({
                      goals: payload.goals.map((goal) =>
                        visible.some((item) => item.goalId === goal.goalId)
                          ? { ...goal, included: true }
                          : goal,
                      ),
                    })
                  }
                >
                  {search ? `Выбрать найденные (${visible.length})` : "Выбрать все"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={!visible.length}
                  onClick={() =>
                    change({
                      goals: payload.goals.map((goal) =>
                        visible.some((item) => item.goalId === goal.goalId)
                          ? { ...goal, included: false }
                          : goal,
                      ),
                    })
                  }
                >
                  {search ? "Снять найденные" : "Снять все"}
                </Button>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y">
                {visible.map((goal) => (
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
                {!visible.length && (
                  <p className="py-4 text-sm text-muted-foreground">
                    {state.goals.length
                      ? "Поиск не дал результатов"
                      : "В этом месяце пока нет целей"}
                  </p>
                )}
              </div>
              {search && (
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>Найдено: {visible.length}. Выбранные цели вне поиска сохраняются.</p>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSearch("")}>
                    Очистить поиск
                  </Button>
                </div>
              )}
              {state.settings.enabled && state.state === "no-goals" && (
                <p className="rounded-lg bg-muted p-3 text-xs">
                  Все выбранные цели удалены или отсутствуют в текущем месяце. Отчёты
                  приостановлены; выберите действующие цели или восстановите их в корзине.
                </p>
              )}
              {selected === 0 && (
                <p className="text-xs text-muted-foreground">
                  Выберите хотя бы одну цель, чтобы включить отчёты.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Новые цели можно добавить сюда после создания. При автоматическом переносе в
                следующий месяц выбор сохранится.
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
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() =>
                change({
                  enabled: state.settings.enabled,
                  wednesdayTime: state.settings.wednesdayTime,
                  sundayTime: state.settings.sundayTime,
                  startsOn: state.startsOn,
                  goals: state.goals.map(({ goalId, included }) => ({ goalId, included })),
                })
              }
            >
              Отмена
            </Button>
          </div>
          <div className="space-y-5">
            {!mobile && previewPanel}
            <section className="hidden rounded-xl border bg-card p-5 sm:block">
              <h2 className="text-sm font-bold">Напоминания работают отдельно</h2>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Этот переключатель управляет итогами недели. Напоминания о заполнении остаются в
                своих настройках.
              </p>
            </section>
            {!mobile && forecastPanel}
          </div>
        </div>
      </fieldset>
      {mobile && (
        <div className="space-y-4">
          {forecastPanel}
          <div className="[&_[data-slot=button]]:w-full">{saveButton}</div>
          <Dialog.Root open={previewOpen} onOpenChange={setPreviewOpen}>
            <Dialog.Trigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={save.isPending}
                />
              }
            >
              Предпросмотр отчёта
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/20" />
              <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 max-h-[95svh] overflow-y-auto rounded-t-2xl border bg-card p-5 shadow-xl [&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-lg">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <Dialog.Title className="text-lg font-bold">Предпросмотр отчёта</Dialog.Title>
                  <Dialog.Close
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Закрыть предпросмотр"
                      />
                    }
                  >
                    <X />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="mb-4 text-xs text-muted-foreground">
                  Черновик отчёта. Предпросмотр ничего не отправляет.
                </Dialog.Description>
                {previewPanel}
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
          <p className="text-xs text-muted-foreground">
            Ежедневные напоминания настраиваются отдельно.
          </p>
        </div>
      )}
      <Link className={buttonVariants({ variant: "outline" })} to={`/plans/${month}/reminders`}>
        Все сообщения
      </Link>
    </form>
  );
}
