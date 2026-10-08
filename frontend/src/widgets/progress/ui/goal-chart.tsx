import { useId } from "react";
import type { ProgressGoal } from "@/shared/api";
import { useIsMobile } from "@/shared/lib/hooks";
import { formatPlannerDay } from "@/shared/lib/planner-calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui";
import { formatNumber, valueLabel } from "../model/presentation";
import { clockAxis } from "../model/time-axis";

export function GoalChart({ goal, compact = false }: { goal: ProgressGoal; compact?: boolean }) {
  const titleId = useId();
  const mobile = useIsMobile();
  const width = compact ? 120 : mobile ? 340 : 930;
  const plotLeft = compact ? 2 : mobile ? 50 : 45;
  const plotRight = width - (compact ? 2 : 20);
  const plotWidth = plotRight - plotLeft;
  const time = goal.tracking.type === "time";
  const tracking = goal.tracking;
  const crossesMidnight =
    tracking.type === "time" &&
    Boolean(
      tracking.targetStart && tracking.targetEnd && tracking.targetStart > tracking.targetEnd,
    );
  const clock = clockAxis(
    goal.days.flatMap((day) => (typeof day.value === "string" ? [day.value] : [])),
    tracking.type === "time" ? tracking.targetStart : undefined,
    tracking.type === "time" ? tracking.targetEnd : undefined,
  );
  const timeValue = clock.unwrap;
  const shownDays = goal.days.filter(
    (day) => compact || !mobile || goal.days.length > 7 || day.state !== "future",
  );
  const points = shownDays.map((day, index) => ({
    ...day,
    index,
    numeric:
      typeof day.value === "number"
        ? day.value
        : typeof day.value === "string"
          ? timeValue(day.value)
          : typeof day.value === "boolean"
            ? Number(day.value)
            : null,
  }));
  const values = points.flatMap((point) => (point.numeric === null ? [] : [point.numeric]));
  const threshold = tracking.type === "quantity" ? tracking.targetValue : null;
  const lower =
    tracking.type === "scale"
      ? tracking.min
      : time
        ? clock.min
        : Math.min(0, ...values, threshold ?? 0);
  const upper =
    tracking.type === "scale"
      ? tracking.max
      : time
        ? clock.max
        : Math.ceil(
            (Math.max(1, ...values, threshold ?? 0) * 1.15) /
              (threshold && threshold >= 10 ? 10 : 1),
          ) * (threshold && threshold >= 10 ? 10 : 1);
  const min = Number.isFinite(lower) && lower < upper ? lower : 0;
  const max = Number.isFinite(upper) && upper > min ? upper : min + 1;
  const x = (index: number) => plotLeft + (index + 0.5) * (plotWidth / points.length);
  const y = (value: number) => 190 - ((value - min) / (max - min)) * 155;
  const tickLabel = (value: number) =>
    time
      ? `${String(Math.floor(value / 60) % 24).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`
      : formatNumber(value);
  const unit =
    tracking.type === "quantity"
      ? (tracking.unit ?? "ед.")
      : tracking.type === "scale"
        ? `Шкала ${tracking.min}–${tracking.max}`
        : time
          ? "Местное время"
          : "Выполнения";
  return (
    <section
      className={compact ? "min-w-0" : "rounded-xl border bg-card p-4 sm:p-5"}
      aria-label={compact ? `Миниграфик: ${goal.title}` : undefined}
    >
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">
            {tracking.type === "quantity"
              ? "Количество по дням"
              : tracking.type === "scale"
                ? "Оценки по дням"
                : time
                  ? "Время по дням"
                  : "Отметки по дням"}
          </h2>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      )}
      {!values.length ? (
        <p
          className={
            compact
              ? "text-[10px] text-muted-foreground"
              : "py-10 text-center text-sm text-muted-foreground"
          }
        >
          {compact ? "Пока нет записей" : "За этот период пока нет записей"}
        </p>
      ) : (
        <svg
          viewBox={compact ? `0 25 ${width} 170` : `0 0 ${width} 230`}
          preserveAspectRatio={compact ? "none" : "xMidYMid meet"}
          className={compact ? "h-8 w-full" : "mt-4 max-h-60 w-full"}
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>
            {goal.title}: результаты по дням. Полные значения доступны в списке записей ниже.
          </title>
          {!compact &&
            [min, (min + max) / 2, max].map((value) => (
              <g key={value}>
                <line
                  x1={plotLeft}
                  x2={plotRight}
                  y1={y(value)}
                  y2={y(value)}
                  stroke="var(--border)"
                />
                {!compact && (
                  <text
                    x={plotLeft - 7}
                    y={y(value) + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill="var(--muted-foreground)"
                  >
                    {tickLabel(value)}
                  </text>
                )}
              </g>
            ))}
          {threshold !== null && (
            <g>
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={y(threshold)}
                y2={y(threshold)}
                stroke="var(--primary)"
                strokeDasharray="5 4"
              />
              {!compact && (
                <text
                  x={plotRight - 5}
                  y={y(threshold) - 6}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--primary)"
                >
                  Цель {formatNumber(threshold)}
                </text>
              )}
            </g>
          )}
          {tracking.type === "time" &&
            clock.bands.map((band) => (
              <rect
                key={band.from}
                x={plotLeft}
                width={plotWidth}
                y={y(band.to)}
                height={y(band.from) - y(band.to)}
                fill="var(--success-soft)"
                opacity="0.6"
              />
            ))}
          {points.map((point, index) => {
            const previous = points[index - 1];
            const numeric = point.numeric;
            return (
              <g key={point.date}>
                {!compact &&
                  (index % (points.length > 10 ? 5 : 1) === 0 || index === points.length - 1) && (
                    <text
                      x={x(index)}
                      y="214"
                      textAnchor="middle"
                      fontSize="11"
                      fill="var(--muted-foreground)"
                    >
                      {points.length <= 7
                        ? `${["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][new Date(`${point.date}T12:00Z`).getUTCDay()]} · `
                        : ""}
                      {Number(point.date.slice(8))}
                    </text>
                  )}
                {numeric === null && !compact && (
                  <text
                    x={x(index)}
                    y="182"
                    textAnchor="middle"
                    fontSize={points.length > 10 ? "10" : "11"}
                    fill="var(--muted-foreground)"
                  >
                    <title>
                      {formatPlannerDay(point.date)}:{" "}
                      {point.state === "excluded"
                        ? "Вне периода учёта"
                        : point.state === "future"
                          ? "Будущий день"
                          : "Нет записи"}
                    </title>
                    {points.length > 10 || mobile
                      ? point.state === "excluded"
                        ? "—"
                        : point.state === "future"
                          ? "·"
                          : "○"
                      : point.state === "excluded"
                        ? "вне учёта"
                        : point.state === "future"
                          ? "впереди"
                          : "нет"}
                  </text>
                )}
                {numeric !== null && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <a
                          href={`/plans/${point.date.slice(0, 7)}?goal=${point.goalId}&date=${point.date}`}
                          aria-label={`${formatPlannerDay(point.date)}: ${valueLabel(goal, point.value)}, открыть запись`}
                          className="outline-none focus-visible:[&>circle]:stroke-foreground focus-visible:[&>circle]:stroke-2 focus-visible:[&>rect]:stroke-foreground focus-visible:[&>rect]:stroke-2"
                        />
                      }
                    >
                      {tracking.type !== "time" ? (
                        <rect
                          x={x(index) - Math.min(18, plotWidth / points.length / 3)}
                          y={Math.min(y(numeric), y(tracking.type === "scale" ? min : 0))}
                          width={Math.min(36, (2 * plotWidth) / points.length / 3)}
                          height={Math.max(
                            2,
                            Math.abs(y(numeric) - y(tracking.type === "scale" ? min : 0)),
                          )}
                          rx="4"
                          fill="var(--primary)"
                        />
                      ) : (
                        <>
                          {!compact &&
                            previous?.numeric !== null &&
                            previous?.numeric !== undefined && (
                              <line
                                x1={x(index - 1)}
                                x2={x(index)}
                                y1={y(previous.numeric)}
                                y2={y(numeric)}
                                stroke="var(--primary)"
                                strokeWidth="2.5"
                              />
                            )}
                          <circle cx={x(index)} cy={y(numeric)} r="4" fill="var(--primary)" />
                        </>
                      )}
                      {!compact && points.length <= 10 && (
                        <text
                          x={x(index)}
                          y={y(numeric) - 9}
                          textAnchor="middle"
                          fontSize="12"
                          fill="var(--primary)"
                        >
                          {time ? String(point.value) : formatNumber(numeric)}
                        </text>
                      )}
                    </TooltipTrigger>
                    <TooltipContent role="tooltip">
                      {formatPlannerDay(point.date)} · {valueLabel(goal, point.value)}
                    </TooltipContent>
                  </Tooltip>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {!compact && (
        <p className="text-xs text-muted-foreground">
          Нет записи: ○ · Вне периода учёта: — · Будущий день: ·. Ноль показан числом 0.
          {shownDays.length < goal.days.length &&
            ` ${formatPlannerDay(goal.days.find((day) => day.state === "future")?.date ?? "")}–${formatPlannerDay(goal.days.at(-1)?.date ?? "")} — впереди.`}
        </p>
      )}
      {!compact && tracking.type === "time" && (
        <p className="text-xs text-muted-foreground">
          {tracking.targetStart || tracking.targetEnd
            ? `Целевое время: ${tracking.targetStart ?? "00:00"}–${tracking.targetEnd ?? "23:59"}${crossesMidnight ? " · через полночь" : ""}`
            : "Время записей без оценки успешности"}
          . Среднее время не рассчитывается.
        </p>
      )}
    </section>
  );
}
