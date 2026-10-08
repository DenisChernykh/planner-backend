import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type GetApiPlansMonth200GoalsItem,
  getApiProblem,
  getGetApiPlansMonthQueryKey,
  putApiGoalsGoalIdEntriesDate,
} from "@/shared/api";
import { isPlannerDateEditable } from "@/shared/lib/planner-calendar";
import { Button, Input } from "@/shared/ui";
import { formatFactDate } from "../model/plan-model";
import { setFactInCache } from "./fact-cache";
import { buildFactPayload, initialFactValue } from "./fact-inspector-model";
import { getFactValueError, getQuickScaleOptions, isQuickFactValueValid } from "./quick-fact-model";

type Goal = GetApiPlansMonth200GoalsItem;
type Entry = Goal["entries"][number];

export function QuickFactInput({
  goal,
  month,
  today,
  onOpenInspector,
}: {
  goal: Goal;
  month: string;
  today: string;
  onOpenInspector: (date: string) => void;
}) {
  const client = useQueryClient();
  const initial = (date: string, entry: Entry | undefined) => ({
    date,
    entry,
    value: initialFactValue({ ...goal, entries: entry ? [entry] : [] }, date),
  });
  const [draft, setDraft] = useState(() =>
    initial(
      today,
      goal.entries.find((item) => item.date === today),
    ),
  );
  const editable = isPlannerDateEditable(draft.date, today, month);
  const original = initial(draft.date, draft.entry).value;
  const dirty = draft.value !== original;
  const latest = goal.entries.find((item) => item.date === draft.date);
  const save = useMutation({
    mutationFn: (input: typeof draft) =>
      putApiGoalsGoalIdEntriesDate(
        { goalId: goal.id, date: input.date },
        buildFactPayload(goal, input.value, input.entry?.note ?? "", input.entry?.revision ?? null),
      ),
    onSuccess: ({ entry }, input) => {
      setFactInCache(client, month, goal.id, input.date, entry);
      setDraft(initial(input.date, entry));
    },
    onSettled: () => client.invalidateQueries({ queryKey: getGetApiPlansMonthQueryKey({ month }) }),
  });
  useEffect(() => {
    if (dirty || save.isPending || save.isError) return;
    const current = goal.entries.find((item) => item.date === today);
    if (draft.date !== today || current?.revision !== draft.entry?.revision)
      setDraft({ date: today, entry: current, value: initialFactValue(goal, today) });
  }, [goal, today, dirty, save.isPending, save.isError, draft.date, draft.entry?.revision]);
  const commit = (value: string) => {
    if (
      !editable ||
      save.isPending ||
      !isQuickFactValueValid(goal, value) ||
      (value === original && !save.isError)
    )
      return;
    save.mutate({ ...draft, value });
  };
  const label = `${goal.title}, ${formatFactDate(draft.date)}`;
  const scale = getQuickScaleOptions(goal);
  const error = getFactValueError(goal, draft.value);
  const conflict = save.isError && getApiProblem(save.error)?.status === 409;
  return (
    <div className="flex min-h-[72px] min-w-0 flex-col gap-2 px-3 py-3" aria-busy={save.isPending}>
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-semibold">
          {draft.date === today ? "Сегодня" : "Черновик"} · {formatFactDate(draft.date)}
        </p>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={save.isPending || !draft.date.startsWith(`${month}-`)}
          aria-label={`Открыть результат: ${label}`}
          onClick={() => onOpenInspector(draft.date)}
        >
          <Pencil aria-hidden="true" />
        </Button>
      </div>
      {!draft.date.startsWith(`${month}-`) ? (
        <p className="text-xs text-muted-foreground">
          В этом месяце нет сегодняшнего дня. Выберите дату в таблице.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Сохраняется автоматически</p>
          {goal.tracking.type === "check" ? (
            <input
              type="checkbox"
              checked={draft.value === "true"}
              disabled={!editable || save.isPending}
              aria-label={`${draft.value === "true" ? "Снять отметку выполнения" : "Отметить выполнение"}: ${label}`}
              onChange={(event) => {
                const value = event.target.checked ? "true" : "false";
                setDraft((current) => ({ ...current, value }));
                commit(value);
              }}
              className="size-5 accent-primary"
            />
          ) : goal.tracking.type === "scale" && scale ? (
            <fieldset className="grid grid-cols-5 gap-1">
              <legend className="sr-only">{`Значение шкалы: ${label}`}</legend>
              {scale.map((value) => (
                <Button
                  key={value}
                  variant={draft.value === String(value) ? "default" : "outline"}
                  className="size-7 p-0 text-sm"
                  disabled={!editable || save.isPending}
                  aria-label={`Шкала ${value}: ${label}`}
                  aria-pressed={draft.value === String(value)}
                  onClick={() => {
                    setDraft((current) => ({ ...current, value: String(value) }));
                    commit(String(value));
                  }}
                >
                  {value}
                </Button>
              ))}
            </fieldset>
          ) : (
            <div className="flex items-center gap-1">
              <Input
                type={goal.tracking.type === "time" ? "time" : "number"}
                min={goal.tracking.type === "scale" ? goal.tracking.min : undefined}
                max={goal.tracking.type === "scale" ? goal.tracking.max : undefined}
                step={goal.tracking.type === "scale" ? 1 : "any"}
                value={draft.value}
                disabled={!editable || save.isPending}
                aria-label={`Ввести факт для цели «${goal.title}», ${formatFactDate(draft.date)}`}
                aria-invalid={Boolean(draft.value && error)}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, value: event.target.value }))
                }
                onBlur={() => commit(draft.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                className="h-9 min-w-0 flex-1 px-2 text-sm md:text-sm"
              />
              {goal.tracking.type === "quantity" && goal.tracking.unit && (
                <span className="max-w-16 break-words text-xs text-muted-foreground">
                  {goal.tracking.unit}
                </span>
              )}
            </div>
          )}
          {draft.value && error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {save.isPending
          ? `Сохраняем за ${formatFactDate(draft.date)}…`
          : save.isSuccess && !dirty
            ? `Сохранено · ${formatFactDate(draft.date)}`
            : dirty
              ? "Есть несохранённый ввод"
              : ""}
      </p>
      {save.isError && (
        <div role="alert" className="space-y-2 text-xs text-destructive">
          <p>
            {conflict
              ? "Запись изменилась. Черновик сохранён. Откройте результат и сравните изменения."
              : "Не удалось сохранить. Черновик и дата сохранены."}
          </p>
          {conflict ? (
            <Button
              variant="outline"
              className="h-auto whitespace-normal text-xs"
              onClick={() => {
                setDraft(initial(draft.date, latest));
                save.reset();
              }}
            >
              Загрузить актуальный результат
            </Button>
          ) : (
            <Button
              variant="outline"
              className="h-auto whitespace-normal text-xs"
              aria-label={`Повторить сохранение факта: ${label}`}
              onClick={() => commit(draft.value)}
            >
              <RotateCcw aria-hidden="true" /> Повторить
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
