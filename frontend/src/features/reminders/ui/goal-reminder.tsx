import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import {
  type GetApiRemindersGoalsMonth200GoalsItem,
  getGetApiRemindersGoalsMonthQueryKey,
  type PutApiRemindersGoalsGoalIdBody,
  putApiRemindersGoalsGoalId,
} from "@/shared/api";
import { Button, TextField } from "@/shared/ui";

const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function GoalReminder({
  goal,
  month,
}: {
  goal: GetApiRemindersGoalsMonth200GoalsItem;
  month: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState<PutApiRemindersGoalsGoalIdBody>({
    mode: goal.mode,
    time: goal.time,
    weekdays: goal.weekdays,
  });
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (data: PutApiRemindersGoalsGoalIdBody) =>
      putApiRemindersGoalsGoalId({ goalId: goal.goalId }, data),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: getGetApiRemindersGoalsMonthQueryKey({ month }) }),
  });
  return (
    <form
      className="space-y-4 rounded-xl border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(draft);
      }}
    >
      <h3 className="font-semibold">{goal.title}</h3>
      <div className="grid items-end gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor={id} className="text-sm font-medium">
            Когда спрашивать
          </label>
          <select
            id={id}
            value={draft.mode}
            onChange={(event) =>
              setDraft({
                ...draft,
                mode: event.target.value as PutApiRemindersGoalsGoalIdBody["mode"],
                weekdays:
                  event.target.value === "off" && !draft.weekdays.length
                    ? [1, 2, 3, 4, 5, 6, 7]
                    : draft.weekdays,
              })
            }
            className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="off">Без напоминания</option>
            <option value="scheduled">В выбранное время</option>
            <option value="evening">В вечернем сборе</option>
          </select>
        </div>
        {draft.mode === "scheduled" && (
          <TextField
            label="Время вопроса"
            type="time"
            value={draft.time}
            required
            onChange={(event) => setDraft({ ...draft, time: event.target.value })}
          />
        )}
      </div>
      {draft.mode !== "off" && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Дни напоминаний</legend>
          <div className="flex flex-wrap gap-2">
            {days.map((day, index) => (
              <label
                key={day}
                className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs"
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={draft.weekdays.includes(index + 1)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      weekdays: event.target.checked
                        ? [...draft.weekdays, index + 1].sort()
                        : draft.weekdays.filter((value) => value !== index + 1),
                    })
                  }
                />
                {day}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Дни вопросов не меняют частоту выполнения цели. Заполненные значения не спрашиваем.
          </p>
        </fieldset>
      )}
      {save.isError && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось сохранить напоминание.
        </p>
      )}
      {save.isSuccess && (
        <p role="status" className="text-sm text-success">
          Напоминание сохранено
        </p>
      )}
      <Button type="submit" variant="outline" disabled={save.isPending || !draft.weekdays.length}>
        {save.isPending ? "Сохраняем…" : "Сохранить напоминание"}
      </Button>
    </form>
  );
}
