import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type ProgressGoal, patchApiGoalsGoalId } from "@/shared/api";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { Button, TextField } from "@/shared/ui";

export function GoalRuleEditor({ goal }: { goal: ProgressGoal }) {
  const versionMonth = goal.days.find((day) => day.goalId === goal.id)?.date.slice(0, 7);
  const [tracking, setTracking] = useState(goal.tracking);
  const [cadence, setCadence] = useState(goal.cadence);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => patchApiGoalsGoalId({ goalId: goal.id }, { tracking, cadence }),
    onSuccess: () =>
      client.invalidateQueries({
        predicate: (query) =>
          /\/api\/(?:progress|plans|reminders)/u.test(String(query.queryKey[0])),
      }),
  });
  return (
    <details className="rounded-xl border bg-card p-4 sm:p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Изменить правило
        {versionMonth ? ` · ${formatPlannerMonth(versionMonth)}` : " этой месячной версии"}
      </summary>
      <form
        className="mt-5 space-y-4 [&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-lg [&_[data-slot=input]]:h-11 [&_[data-slot=input]]:rounded-lg"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <p className="rounded-lg bg-primary-soft p-3 text-sm">
          После сохранения существующие записи этой месячной версии будут пересчитаны по новому
          правилу. Значения, даты и заметки сохранятся.
        </p>
        {tracking.type === "quantity" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="block">Условие</span>
              <select
                className="h-10 w-full rounded-lg border bg-card px-3"
                value={tracking.comparison}
                onChange={(event) =>
                  setTracking({
                    ...tracking,
                    comparison: event.target.value as "atLeast" | "atMost" | "equal",
                  })
                }
              >
                <option value="atLeast">Не менее</option>
                <option value="atMost">Не более</option>
                <option value="equal">Ровно</option>
              </select>
            </label>
            <TextField
              label="Порог"
              type="number"
              step="any"
              required
              value={tracking.targetValue}
              onChange={(event) =>
                setTracking({ ...tracking, targetValue: Number(event.target.value) })
              }
            />
          </div>
        )}
        {tracking.type === "scale" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Минимум шкалы"
              type="number"
              required
              value={tracking.min}
              onChange={(event) => setTracking({ ...tracking, min: Number(event.target.value) })}
            />
            <TextField
              label="Максимум шкалы"
              type="number"
              required
              value={tracking.max}
              onChange={(event) => setTracking({ ...tracking, max: Number(event.target.value) })}
            />
          </div>
        )}
        {tracking.type === "time" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Не раньше"
              type="time"
              value={tracking.targetStart ?? ""}
              onChange={(event) =>
                setTracking({ ...tracking, targetStart: event.target.value || undefined })
              }
            />
            <TextField
              label="Не позже"
              type="time"
              value={tracking.targetEnd ?? ""}
              onChange={(event) =>
                setTracking({ ...tracking, targetEnd: event.target.value || undefined })
              }
            />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="block">Периодичность</span>
            <select
              className="h-10 w-full rounded-lg border bg-card px-3"
              value={cadence.period}
              onChange={(event) =>
                setCadence(
                  event.target.value === "day"
                    ? { period: "day" }
                    : { period: event.target.value as "week" | "month", targetOccurrences: 3 },
                )
              }
            >
              <option value="day">Каждый день</option>
              <option value="week">За неделю</option>
              <option value="month">За месяц</option>
            </select>
          </label>
          {cadence.period !== "day" && (
            <TextField
              label="Число повторений"
              type="number"
              min={1}
              max={cadence.period === "week" ? 7 : 31}
              required
              value={cadence.targetOccurrences}
              onChange={(event) =>
                setCadence({ ...cadence, targetOccurrences: Number(event.target.value) })
              }
            />
          )}
        </div>
        {save.isError && (
          <p role="alert" className="text-sm text-destructive">
            Не удалось сохранить правило. Проверьте границы и число повторений и повторите попытку.
          </p>
        )}
        {save.isSuccess && (
          <p role="status" className="text-sm text-success">
            Правило сохранено, результаты пересчитаны
          </p>
        )}
        <Button disabled={save.isPending} type="submit">
          {save.isPending ? "Пересчитываем…" : "Сохранить и пересчитать"}
        </Button>
      </form>
    </details>
  );
}
