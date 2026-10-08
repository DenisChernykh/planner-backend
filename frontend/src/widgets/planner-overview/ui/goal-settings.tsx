import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  deleteApiGoalsGoalId,
  type GetApiPlansMonth200GoalsItem,
  getApiProblem,
  patchApiGoalsGoalId,
} from "@/shared/api";
import { getPlannerMonthEnd } from "@/shared/lib/planner-calendar";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  TextareaField,
  TextField,
} from "@/shared/ui";
import { getTrackingLabel } from "../model/plan-model";

type Goal = GetApiPlansMonth200GoalsItem;

export function GoalSettings({
  goal,
  onClose,
  onTrashed,
}: {
  goal: Goal;
  onClose: () => void;
  onTrashed: (goal: Goal) => void;
}) {
  const client = useQueryClient();
  const [period, setPeriod] = useState(goal.cadence.period);
  const [confirm, setConfirm] = useState(false);
  const refresh = () =>
    client.invalidateQueries({
      predicate: (query) =>
        /\/api\/(?:plans|progress|reminders|search)/u.test(String(query.queryKey[0])),
    });
  const save = useMutation({
    mutationFn: (data: Parameters<typeof patchApiGoalsGoalId>[1]) =>
      patchApiGoalsGoalId({ goalId: goal.id }, data),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteApiGoalsGoalId({ goalId: goal.id }),
    onSuccess: async () => {
      onTrashed(goal);
      onClose();
      await refresh();
    },
  });
  const busy = save.isPending || remove.isPending;
  const tracking = goal.tracking;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto p-5 sm:max-w-md">
        <SheetTitle className="pr-8">Изменить цель</SheetTitle>
        <SheetDescription className="break-words">{goal.title}</SheetDescription>
        <form
          className="mt-4 space-y-4 [&_input]:min-h-11 [&_input]:rounded-lg [&_input]:text-base [&_textarea]:text-base"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            const data = new FormData(event.currentTarget);
            const text = (name: string) => String(data.get(name) ?? "");
            let next: Goal["tracking"] = tracking;
            if (tracking.type === "quantity")
              next = {
                type: "quantity",
                comparison: text("comparison") as "atLeast" | "atMost" | "equal",
                targetValue: Number(text("target")),
                unit: text("unit").trim() || undefined,
              };
            else if (tracking.type === "scale")
              next = { type: "scale", min: Number(text("min")), max: Number(text("max")) };
            else if (tracking.type === "time")
              next = {
                type: "time",
                targetStart: text("start") || undefined,
                targetEnd: text("end") || undefined,
              };
            save.mutate({
              title: text("title").trim(),
              description: text("description") || null,
              tracking: next,
              cadence:
                period === "day"
                  ? { period }
                  : { period, targetOccurrences: Number(text("occurrences")) },
            });
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <TextField
              name="title"
              label="Название цели"
              defaultValue={goal.title}
              required
              maxLength={160}
            />
            <TextareaField
              name="description"
              label="Описание"
              defaultValue={goal.description ?? ""}
              maxLength={2000}
            />
            <p className="text-sm text-muted-foreground">
              Способ учёта: {getTrackingLabel(tracking.type)}. После создания он сохраняется.
            </p>
            <p className="rounded-lg bg-primary-soft p-3 text-sm">
              {goal.entries.length
                ? "Существующие значения, даты и заметки сохранятся. Выполнение этой месячной версии будет пересчитано по новому условию и частоте."
                : "Изменения относятся к этой месячной версии цели."}
            </p>
            {tracking.type === "quantity" && (
              <>
                <label className="block space-y-2 text-sm">
                  Условие
                  <select
                    name="comparison"
                    aria-label="Условие"
                    defaultValue={tracking.comparison}
                    className="h-11 w-full rounded-lg border bg-card px-3"
                  >
                    <option value="atLeast">Не меньше</option>
                    <option value="atMost">Не больше</option>
                    <option value="equal">Ровно</option>
                  </select>
                </label>
                <TextField
                  name="target"
                  label="Порог"
                  type="number"
                  step="any"
                  required
                  defaultValue={tracking.targetValue}
                />
                <TextField
                  name="unit"
                  label="Единица измерения"
                  defaultValue={tracking.unit ?? ""}
                  maxLength={64}
                />
              </>
            )}
            {tracking.type === "scale" && (
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  name="min"
                  label="Минимум шкалы"
                  type="number"
                  step={1}
                  required
                  defaultValue={tracking.min}
                />
                <TextField
                  name="max"
                  label="Максимум шкалы"
                  type="number"
                  step={1}
                  required
                  defaultValue={tracking.max}
                />
              </div>
            )}
            {tracking.type === "time" && (
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  name="start"
                  label="Не раньше"
                  type="time"
                  defaultValue={tracking.targetStart ?? ""}
                />
                <TextField
                  name="end"
                  label="Не позже"
                  type="time"
                  defaultValue={tracking.targetEnd ?? ""}
                />
              </div>
            )}
            <label className="block space-y-2 text-sm">
              Периодичность
              <select
                aria-label="Периодичность"
                value={period}
                onChange={(event) => setPeriod(event.target.value as typeof period)}
                className="h-11 w-full rounded-lg border bg-card px-3"
              >
                <option value="day">Каждый день</option>
                <option value="week">За неделю</option>
                <option value="month">За месяц</option>
              </select>
            </label>
            {period !== "day" && (
              <TextField
                name="occurrences"
                label="Число повторений"
                type="number"
                required
                min={1}
                max={period === "week" ? 7 : Number(getPlannerMonthEnd(goal.month).slice(8))}
                defaultValue={goal.cadence.period === "day" ? 1 : goal.cadence.targetOccurrences}
              />
            )}
          </fieldset>
          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              {getApiProblem(save.error)?.status === 409
                ? "Параметры изменились во время сохранения. Повторите попытку."
                : "Не удалось сохранить цель. Проверьте название, границы и частоту и повторите попытку. Введённые данные сохранены."}
            </p>
          )}
          <Button
            type="submit"
            disabled={busy}
            isLoading={save.isPending}
            loadingLabel="Сохраняем цель"
            className="min-h-11 w-full rounded-lg"
          >
            Сохранить цель
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setConfirm(true)}
            className="min-h-11 w-full rounded-lg"
          >
            Переместить в корзину
          </Button>
        </form>
        <AlertDialog
          open={confirm}
          onOpenChange={(open) => {
            if (!busy) setConfirm(open);
          }}
        >
          <AlertDialogContent className="rounded-xl">
            <AlertDialogTitle>Переместить цель в корзину?</AlertDialogTitle>
            <AlertDialogDescription>
              «{goal.title}» исчезнет из плана. Результаты и заметки сохранятся; цель можно
              восстановить.
            </AlertDialogDescription>
            {remove.isError && (
              <p role="alert" className="text-sm text-destructive">
                Не удалось переместить цель. Повторите попытку.
              </p>
            )}
            <Button variant="destructive" disabled={busy} onClick={() => remove.mutate()}>
              Переместить в корзину
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>
              Отмена
            </Button>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
