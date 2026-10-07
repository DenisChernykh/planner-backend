import { useId } from "react";
import type { ProgressGoal } from "@/shared/api";
import { useIsMobile } from "@/shared/lib/hooks";
import { formatPlannerDay } from "@/shared/lib/planner-calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui";
import { formatNumber, valueLabel } from "../model/presentation";

const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
export function GoalChart({ goal }: { goal: ProgressGoal }) {
  const titleId = useId();
  const mobile = useIsMobile();
  const width = mobile ? 340 : 930;
  const plotLeft = mobile ? 50 : 45;
  const plotRight = width - 20;
  const plotWidth = plotRight - plotLeft;
  const time = goal.tracking.type === "time";
  const tracking = goal.tracking;
  const crossesMidnight =
    tracking.type === "time" &&
    Boolean(
      tracking.targetStart && tracking.targetEnd && tracking.targetStart > tracking.targetEnd,
    );
  const timeValue = (value: string) =>
    minutes(value) +
    (crossesMidnight &&
    tracking.type === "time" &&
    minutes(value) < minutes(tracking.targetStart ?? "00:00")
      ? 24 * 60
      : 0);
  const points = goal.days.map((day, index) => ({
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
        ? Math.floor(
            Math.min(
              ...values,
              tracking.type === "time" && tracking.targetStart
                ? timeValue(tracking.targetStart)
                : 24 * 60,
            ) / 60,
          ) * 60
        : Math.min(0, ...values, threshold ?? 0);
  const upper =
    tracking.type === "scale"
      ? tracking.max
      : time
        ? Math.ceil(
            Math.max(
              ...values,
              tracking.type === "time" && tracking.targetEnd ? timeValue(tracking.targetEnd) : 0,
            ) / 60,
          ) * 60
        : Math.max(1, ...values, threshold ?? 0) * 1.15;
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
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Результаты по дням</h2>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      {!values.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          За этот период пока нет записей
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${width} 230`}
          className="mt-5 w-full"
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>
            {goal.title}: результаты по дням. Полные значения доступны в списке записей ниже.
          </title>
          {[min, (min + max) / 2, max].map((value) => (
            <g key={value}>
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={y(value)}
                y2={y(value)}
                stroke="var(--border)"
              />
              <text
                x={plotLeft - 7}
                y={y(value) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--muted-foreground)"
              >
                {tickLabel(value)}
              </text>
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
              <text
                x={plotRight - 5}
                y={y(threshold) - 6}
                textAnchor="end"
                fontSize="11"
                fill="var(--primary)"
              >
                Цель {formatNumber(threshold)}
              </text>
            </g>
          )}
          {tracking.type === "time" && (tracking.targetStart || tracking.targetEnd) && (
            <rect
              x={plotLeft}
              width={plotWidth}
              y={y(tracking.targetEnd ? timeValue(tracking.targetEnd) : max)}
              height={Math.max(
                0,
                y(tracking.targetStart ? timeValue(tracking.targetStart) : min) -
                  y(tracking.targetEnd ? timeValue(tracking.targetEnd) : max),
              )}
              fill="var(--success-soft)"
              opacity="0.6"
            />
          )}
          {points.map((point, index) => {
            const previous = points[index - 1];
            const numeric = point.numeric;
            return (
              <g key={point.date}>
                {(index % (points.length > 10 ? 5 : 1) === 0 || index === points.length - 1) && (
                  <text
                    x={x(index)}
                    y="214"
                    textAnchor="middle"
                    fontSize="11"
                    fill="var(--muted-foreground)"
                  >
                    {Number(point.date.slice(8))}
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
                      {tracking.type === "quantity" || tracking.type === "check" ? (
                        <rect
                          x={x(index) - Math.min(18, plotWidth / points.length / 3)}
                          y={Math.min(y(numeric), y(0))}
                          width={Math.min(36, (2 * plotWidth) / points.length / 3)}
                          height={Math.max(2, Math.abs(y(numeric) - y(0)))}
                          rx="4"
                          fill="var(--primary)"
                        />
                      ) : (
                        <>
                          {previous?.numeric !== null && previous?.numeric !== undefined && (
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
                      {points.length <= 10 && (
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
      {tracking.type === "time" && (
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
