import {
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hash,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { ProgressStartDate } from "@/features/progress-settings";
import {
  getApiProblem,
  type ProgressOverview,
  useGetApiProgress,
  useGetApiProgressGoalsGoalId,
  useGetApiRemindersSettings,
} from "@/shared/api";
import { addPlannerDays, addPlannerMonth, formatPlannerDay } from "@/shared/lib/planner-calendar";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { cn } from "@/shared/lib/utils";
import { Button, buttonVariants, Skeleton } from "@/shared/ui";
import { formatNumber, goalRule, valueLabel } from "../model/presentation";
import { GoalChart } from "./goal-chart";
import { GoalDetail } from "./goal-detail";
import { GoalFilter } from "./goal-filter";
import { ProgressCalendar } from "./progress-calendar";
import { ProgressMeter } from "./progress-meter";

const icons = { check: CheckCircle2, quantity: Hash, scale: SlidersHorizontal, time: Clock3 };
function Summary({ data }: { data: ProgressOverview }) {
  const summary = data.summary;
  return (
    <div className={`grid gap-3 ${summary.dailyDays ? "grid-cols-3" : "grid-cols-2"}`}>
      <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-5">
        <p className="text-2xl font-bold sm:text-3xl">{summary.met}</p>
        <h2 className="mt-3 break-words text-[10px] text-muted-foreground sm:text-xs">
          <span className="sm:hidden">Сделано</span>
          <span className="hidden sm:inline">Подтверждённых выполнений</span>
        </h2>
      </section>
      {summary.dailyDays > 0 && (
        <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-5">
          <p className="text-2xl font-bold sm:text-3xl">{summary.dailyPercent}%</p>
          <h2 className="mt-3 text-[10px] text-muted-foreground sm:text-xs">
            Ежедневных записей · {summary.dailyRecords} из {summary.dailyDays}
          </h2>
        </section>
      )}
      <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-5">
        <p className="text-2xl font-bold sm:text-3xl">
          <span className="sm:hidden">
            {summary.daysWithEntries}/{summary.eligibleDays}
          </span>
          <span className="hidden sm:inline">
            {summary.daysWithEntries} из {summary.eligibleDays}
          </span>
        </p>
        <h2 className="mt-3 text-[10px] text-muted-foreground sm:text-xs">Дней с записями</h2>
      </section>
    </div>
  );
}
export function ProgressView({ month }: { month: string }) {
  const [params, setParams] = useSearchParams();
  const general = useGetApiRemindersSettings();
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: general.data?.settings.timeZone ?? "Asia/Yekaterinburg",
  }).format(new Date());
  const period = params.get("period") === "month" ? "month" : "week";
  const anchor = params.get("anchor") ?? (month === today.slice(0, 7) ? today : `${month}-01`);
  const goalId = params.get("goal") ?? "";
  const selected = params.get("goals")?.split(",") ?? (params.get("empty") === "1" ? [] : null);
  const ready = Boolean(general.data);
  const all = useGetApiProgress(
    { period, anchor },
    { query: { enabled: ready, refetchOnMount: "always" } },
  );
  const filtered = useGetApiProgress(
    { period, anchor, goals: params.get("goals") ?? undefined },
    { query: { enabled: ready && Boolean(params.get("goals")) } },
  );
  const detail = useGetApiProgressGoalsGoalId(
    { goalId },
    { period, anchor },
    { query: { enabled: ready && Boolean(goalId) } },
  );
  const query = goalId ? detail : params.get("goals") ? filtered : all;
  const data = query.data;
  const goal = goalId ? data?.goals[0] : null;
  const update = (patch: Record<string, string | null>) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    });
  const move = (offset: number) => {
    if (data)
      update({
        anchor:
          period === "week"
            ? addPlannerDays(data.requested.from, offset * 7)
            : `${addPlannerMonth(data.requested.from.slice(0, 7), offset)}-01`,
        goals: null,
        empty: null,
      });
  };
  const reportUrl = `/plans/${month}/reminders?tab=reports`;
  const emptyMessage =
    data?.state === "future-start"
      ? `Учёт начнётся ${formatPlannerDay(data.startsOn ?? today)} ${data.startsOn?.slice(0, 4)}`
      : data?.state === "before-start"
        ? "Период раньше начала учёта"
        : "В этом периоде пока нет целей";
  return (
    <div className="min-w-0 bg-background px-5 py-7 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          {goal && (
            <Link
              to={`?${new URLSearchParams({ period, anchor })}`}
              className="mb-4 flex min-h-11 items-center gap-2 text-sm text-muted-foreground sm:hidden"
            >
              <ChevronLeft className="size-4" />
              Все цели
            </Link>
          )}
          <h1 className="flex items-center gap-3 text-[26px] font-bold tracking-tight sm:text-[32px]">
            {goal &&
              (() => {
                const Icon = icons[goal.tracking.type];
                return (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary sm:hidden">
                    <Icon className="size-5" />
                  </span>
                );
              })()}
            {goal?.title ?? "Прогресс"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {goal ? goalRule(goal) : "Ваши результаты и ритм целей."}
          </p>
        </div>
        <Link
          to={reportUrl}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "hidden h-11 rounded-lg px-4 sm:inline-flex",
          )}
        >
          Отчёты в Telegram
          <Send className="size-4" />
        </Link>
      </header>
      <div className="mb-5 grid items-center gap-4 lg:grid-cols-[230px_1fr_auto]">
        <div className="flex rounded-lg bg-muted p-1">
          {(["week", "month"] as const).map((value) => (
            <Button
              key={value}
              variant={period === value ? "default" : "ghost"}
              className="h-11 flex-1 rounded-md"
              aria-pressed={period === value}
              onClick={() => update({ period: value })}
            >
              {value === "week" ? "Неделя" : "Месяц"}
            </Button>
          ))}
        </div>
        <div className="flex min-w-0 items-center justify-between rounded-lg border bg-card px-1">
          <Button
            variant="ghost"
            className="size-11 shrink-0"
            aria-label="Предыдущий период"
            onClick={() => move(-1)}
            disabled={!data}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-0 text-center text-xs font-semibold sm:text-sm">
            {data
              ? period === "week"
                ? `${formatPlannerDay(data.requested.from)} – ${formatPlannerDay(data.requested.to)} ${data.requested.to.slice(0, 4)}`
                : formatPlannerMonth(data.requested.from.slice(0, 7))
              : "Загружаем период…"}
          </span>
          <Button
            variant="ghost"
            className="size-11 shrink-0"
            aria-label="Следующий период"
            onClick={() => move(1)}
            disabled={!data}
          >
            <ChevronRight />
          </Button>
        </div>
        {data && <ProgressStartDate startsOn={data.startsOn} today={data.today} />}
      </div>
      {data && (data.requested.to < today || data.requested.from > today) && (
        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => update({ anchor: today, goals: null, empty: null })}
        >
          К текущему периоду
        </Button>
      )}
      {(general.isPending || (ready && query.isPending)) && (
        <div role="status" aria-label="Загружаем статистику" className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-52 rounded-xl" />
          <p className="text-sm text-muted-foreground">Загружаем статистику…</p>
        </div>
      )}
      {(query.isError || general.isError) && (
        <section className="rounded-xl border bg-card p-7">
          <h2 role="alert" className="font-bold">
            {getApiProblem(query.error)?.status === 404
              ? "Цель удалена или недоступна"
              : "Не удалось загрузить статистику"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {getApiProblem(query.error)?.status === 404
              ? "Вернитесь к списку целей. Удалённые цели можно восстановить в корзине."
              : "Проверьте соединение и повторите попытку."}
          </p>
          {getApiProblem(query.error)?.status === 404 ? (
            <Button
              className="mt-4"
              onClick={() => update({ goal: null, goals: null, empty: null })}
            >
              Все цели
            </Button>
          ) : (
            <Button
              className="mt-4"
              onClick={() => {
                void query.refetch();
                void general.refetch();
              }}
            >
              Повторить
            </Button>
          )}
        </section>
      )}
      {data && !query.isError && (
        <div className="space-y-5">
          {["future-start", "before-start", "no-goals"].includes(data.state) ? (
            <section className="rounded-xl border bg-card px-5 py-12 text-center">
              <ChartNoAxesCombined className="mx-auto size-8 text-primary" />
              <h2 className="mt-4 text-lg font-bold">{emptyMessage}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {data.state === "no-goals"
                  ? "Добавьте цели в план, чтобы видеть их результаты."
                  : "Ранее внесённые факты сохраняются в плане."}
              </p>
              {data.state === "no-goals" && (
                <Link to={`/plans/${month}/goals/new`} className={`${buttonVariants()} mt-5`}>
                  Добавить цель
                </Link>
              )}
              {data.state !== "no-goals" && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <ProgressStartDate startsOn={data.startsOn} today={data.today} />
                  <Link to={`/plans/${month}`} className={buttonVariants({ variant: "outline" })}>
                    Открыть план
                  </Link>
                </div>
              )}
            </section>
          ) : selected?.length === 0 && !goalId ? (
            <section className="rounded-xl border bg-card p-8">
              <h2 className="font-bold">Фильтр не дал результатов</h2>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => update({ goals: null, empty: null })}
              >
                Показать все цели
              </Button>
            </section>
          ) : goalId ? (
            <div className="space-y-5">
              {data.goals.map((item) => (
                <GoalDetail key={item.id} goal={item} today={data.today} />
              ))}
            </div>
          ) : (
            <>
              <Summary data={data} />
              {data.state === "no-entries" && (
                <p role="status" className="rounded-xl bg-primary-soft p-4 text-sm">
                  За этот период пока нет записей. Внесите первый результат в плане.
                  <Link
                    to={`/plans/${month}`}
                    className="mt-3 block text-primary underline underline-offset-4"
                  >
                    Открыть план
                  </Link>
                </p>
              )}
              <ProgressCalendar key={`${data.requested.from}-${data.requested.to}`} data={data} />
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">
                  Цели{" "}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {data.goals.length}
                  </span>
                </h2>
                <GoalFilter
                  goals={all.data?.goals ?? data.goals}
                  selected={selected}
                  onApply={(ids) =>
                    update({
                      goals: ids?.length ? ids.join(",") : null,
                      empty: ids?.length === 0 ? "1" : null,
                    })
                  }
                />
              </div>
              <div className="space-y-4 sm:space-y-0">
                {data.goals.map((item) => {
                  const Icon = icons[item.tracking.type];
                  const singleTarget = item.targets.length === 1 ? item.targets[0] : undefined;
                  const mobileResult =
                    item.tracking.type === "scale"
                      ? `${formatNumber(item.average)} из ${item.tracking.max}`
                      : item.tracking.type === "time" && !item.measurable
                        ? String(
                            item.days.findLast((day) => typeof day.value === "string")?.value ??
                              "—",
                          )
                        : singleTarget
                          ? `${singleTarget.value} из ${singleTarget.target ?? singleTarget.originalTarget}${singleTarget.percent === null ? "" : ` · ${singleTarget.percent}%`}`
                          : null;
                  return (
                    <article
                      key={item.id}
                      className="rounded-xl border bg-card p-4 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(180px,300px)_16px] sm:items-center sm:gap-x-5 sm:rounded-none sm:border-x-0 sm:border-t-0 sm:px-4 sm:py-5"
                    >
                      <Link
                        to={`?${new URLSearchParams({ period, anchor, goal: item.id })}`}
                        className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block break-words text-sm">{item.title}</strong>
                          <span className="mt-2 hidden text-xs text-muted-foreground sm:block">
                            {goalRule(item)}
                          </span>
                          {data.goals.some(
                            (other) => other.chainId === item.chainId && other.id !== item.id,
                          ) && (
                            <span className="mt-2 block text-xs text-primary">
                              {formatPlannerDay(
                                item.days.find((day) => day.goalId !== null)?.date ??
                                  data.requested.from,
                              )}
                              –
                              {formatPlannerDay(
                                item.days.findLast((day) => day.goalId !== null)?.date ??
                                  data.requested.to,
                              )}{" "}
                              · отдельное правило
                            </span>
                          )}
                        </span>
                        {mobileResult && (
                          <span className="max-w-[45%] shrink-0 text-right text-xs font-semibold sm:hidden">
                            {mobileResult}
                          </span>
                        )}
                      </Link>
                      <p className="mt-3 text-xs text-muted-foreground sm:hidden">
                        {goalRule(item)}
                      </p>
                      <div className="mt-3 space-y-2 sm:col-start-2 sm:row-start-1 sm:mt-0">
                        {item.tracking.type === "scale" && (
                          <p className="hidden text-sm font-semibold sm:block">
                            Среднее: {formatNumber(item.average)} из {item.tracking.max}
                          </p>
                        )}
                        {item.tracking.type === "time" && !item.measurable && (
                          <p className="hidden text-sm font-semibold sm:block">
                            Последняя запись:{" "}
                            {String(
                              item.days.findLast((day) => typeof day.value === "string")?.value ??
                                "—",
                            )}
                          </p>
                        )}
                        {item.targets
                          .filter((target) => target.accounted !== null || target.missingPlan)
                          .map((target) => (
                            <div key={target.from}>
                              {item.targets.length > 1 && target.from <= data.today && (
                                <p className="mb-1 text-xs text-muted-foreground">
                                  {formatPlannerDay(target.from)}–{formatPlannerDay(target.to)}
                                </p>
                              )}
                              <ProgressMeter
                                target={target}
                                goal={item}
                                today={data.today}
                                compactLabel={Boolean(mobileResult)}
                              />
                            </div>
                          ))}
                        <div className="flex items-center gap-3">
                          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                            {item.tracking.type === "quantity" &&
                              (() => {
                                const current = item.days.find(
                                  (day) =>
                                    day.date === data.today &&
                                    day.state !== "excluded" &&
                                    day.value !== null,
                                );
                                return current ? (
                                  <span className="mb-1 block">
                                    Сегодня: {valueLabel(item, current.value)}
                                  </span>
                                ) : null;
                              })()}
                            {item.cadence.period === "month" && data.period === "week"
                              ? `За эту неделю: ${item.measurable ? item.met : item.records} · `
                              : ""}
                            {item.tracking.type === "quantity" && item.sum !== null
                              ? `${formatNumber(item.sum)} ${item.tracking.unit ?? "ед."} за период · `
                              : ""}
                            Внесено {item.records} из {item.eligibleDays}
                            {item.cadence.period === "day" && item.missing
                              ? ` · ${item.missing} дн. без записи`
                              : ""}
                          </p>
                          <div className="w-20 shrink-0">
                            <GoalChart goal={item} compact />
                          </div>
                        </div>
                      </div>
                      <Link
                        to={`?${new URLSearchParams({ period, anchor, goal: item.id })}`}
                        className="hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary sm:col-start-3 sm:row-start-1 sm:block"
                        aria-label={`Подробности: ${item.title}`}
                      >
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    </article>
                  );
                })}
              </div>
              {data.goals.length > 0 &&
                data.goals.every((item) => item.comparisonReason === "insufficient-history") && (
                  <p className="text-xs text-muted-foreground">
                    Пока недостаточно данных для сравнения: учитываем только дни после начала учёта
                    и сопоставимые периоды с одинаковыми правилами.
                  </p>
                )}
            </>
          )}
          {goalId && (
            <Button variant="outline" onClick={() => update({ goal: null })}>
              <ChevronLeft />
              Все цели
            </Button>
          )}
          <Link
            to={reportUrl}
            className={`${buttonVariants({ variant: "outline" })} w-full rounded-lg sm:hidden`}
          >
            Отчёты в Telegram
            <Send className="size-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
