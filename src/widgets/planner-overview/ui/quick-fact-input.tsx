import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Pencil, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";

import {
  type GetApiPlansMonth200GoalsItem,
  getGetApiPlansMonthQueryKey,
  putApiGoalsGoalIdEntriesDate,
} from "@/shared/api";
import { clampPlannerDate, isPlannerDateEditable } from "@/shared/lib/planner-calendar";
import { Button, Input } from "@/shared/ui";

import { setFactInCache } from "./fact-cache";
import { buildFactPayload, initialFactValue } from "./fact-inspector-model";
import { getQuickScaleOptions, isQuickFactValueValid } from "./quick-fact-model";
import { trackingIconMap } from "./tracking-presentation";

type QuickFactInputProps = {
  goal: GetApiPlansMonth200GoalsItem;
  month: string;
  today: string;
  onOpenInspector: () => void;
};

export function QuickFactInput({ goal, month, today, onOpenInspector }: QuickFactInputProps) {
  const queryClient = useQueryClient();
  const date = clampPlannerDate(today, today, month);
  const entry = goal.entries.find((item) => item.date === date);
  const editable = isPlannerDateEditable(date, today, month);
  const [draft, setDraft] = useState(() => initialFactValue(goal, date));
  const lastValue = useRef<string | undefined>(undefined);
  const save = useMutation({
    mutationFn: (value: string) =>
      putApiGoalsGoalIdEntriesDate(
        { goalId: goal.id, date },
        buildFactPayload(goal, value, entry?.note ?? ""),
      ),
    onSuccess: ({ entry: saved }) => setFactInCache(queryClient, month, goal.id, date, saved),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: getGetApiPlansMonthQueryKey({ month }) }),
  });
  const commit = (value: string) => {
    if (!editable || !isQuickFactValueValid(goal, value)) return;
    lastValue.current = value;
    save.mutate(value);
  };
  const retry = () => {
    const value = lastValue.current;
    if (value) commit(value);
  };
  const Icon = trackingIconMap[goal.tracking.type];
  const scaleOptions = getQuickScaleOptions(goal);

  return (
    <div className="flex min-h-[72px] min-w-0 flex-col gap-1 px-2 py-2" aria-busy={save.isPending}>
      <div className="flex items-center justify-between gap-1 text-[0.65rem] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1 font-semibold">
          <Icon className="size-3" aria-hidden="true" /> Факт
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={save.isPending}
          aria-label={`Открыть инспектор факта «${goal.title}»`}
          onClick={onOpenInspector}
        >
          <Pencil aria-hidden="true" />
        </Button>
      </div>
      {goal.tracking.type === "check" && (
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={draft === "true"}
            disabled={!editable || save.isPending}
            aria-label={draft === "true" ? "Снять отметку выполнения" : "Отметить выполнение"}
            onChange={(event) => {
              const value = event.target.checked ? "true" : "false";
              setDraft(value);
              commit(value);
            }}
            className="size-4 accent-primary"
          />
          <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
        </label>
      )}
      {goal.tracking.type === "scale" && scaleOptions && (
        <fieldset className="grid grid-cols-5 gap-0.5">
          <legend className="sr-only">Значение шкалы</legend>
          {scaleOptions.map((option) => (
            <Button
              key={option}
              type="button"
              variant={draft === String(option) ? "default" : "outline"}
              size="icon-xs"
              className="size-5 text-[0.62rem]"
              disabled={!editable || save.isPending}
              aria-label={`Шкала ${option}`}
              aria-pressed={draft === String(option)}
              onClick={() => {
                const value = String(option);
                setDraft(value);
                commit(value);
              }}
            >
              {option}
            </Button>
          ))}
        </fieldset>
      )}
      {(goal.tracking.type === "quantity" ||
        goal.tracking.type === "time" ||
        (goal.tracking.type === "scale" && !scaleOptions)) && (
        <div className="flex items-center gap-1">
          <Icon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            type={goal.tracking.type === "time" ? "time" : "number"}
            min={goal.tracking.type === "scale" ? goal.tracking.min : undefined}
            max={goal.tracking.type === "scale" ? goal.tracking.max : undefined}
            step={goal.tracking.type === "scale" ? 1 : undefined}
            value={draft}
            disabled={!editable || save.isPending}
            aria-label={`Ввести факт для цели «${goal.title}»`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="h-7 min-w-0 flex-1 px-1.5"
          />
          {goal.tracking.type === "quantity" && goal.tracking.unit && (
            <span className="max-w-12 shrink-0 truncate text-[0.65rem] text-muted-foreground">
              {goal.tracking.unit}
            </span>
          )}
        </div>
      )}
      {save.isPending && <span className="text-[0.6rem] text-muted-foreground">Сохраняем…</span>}
      {save.isError && (
        <div className="flex items-center gap-1 text-[0.6rem] text-destructive" role="alert">
          <span>Не удалось сохранить</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Повторить сохранение факта"
            onClick={retry}
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
