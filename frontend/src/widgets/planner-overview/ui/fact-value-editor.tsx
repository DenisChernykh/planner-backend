import { Trash2 } from "lucide-react";
import { useId } from "react";
import type { GetApiPlansMonth200GoalsItem } from "@/shared/api";
import { Button, Input } from "@/shared/ui";
import { formatFactDate, getGoalMeta } from "../model/plan-model";
import { getFactValueError } from "./quick-fact-model";

type FactValueEditorProps = {
  goal: GetApiPlansMonth200GoalsItem;
  date: string;
  value: string;
  editable: boolean;
  hasEntry: boolean;
  savePending: boolean;
  deletePending: boolean;
  saveError: boolean;
  deleteError: boolean;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
};

export function FactValueEditor(props: FactValueEditorProps) {
  const {
    goal,
    date,
    value,
    editable,
    hasEntry,
    savePending,
    deletePending,
    onValueChange,
    onSave,
    onDelete,
  } = props;
  const id = useId();
  const error = getFactValueError(goal, value);
  const pending = savePending || deletePending;
  return (
    <section className="space-y-3 border-b bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <h3 className="font-bold">Результат за день</h3>
        <span className="text-muted-foreground">
          {editable ? "Можно изменить" : "Только просмотр"}
        </span>
      </div>
      <p id={`${id}-condition`} className="text-sm text-muted-foreground">
        {getGoalMeta(goal)}
      </p>
      {goal.tracking.type === "check" ? (
        <Button
          variant={value === "true" ? "default" : "outline"}
          disabled={!editable || pending}
          aria-pressed={value === "true"}
          onClick={() => onValueChange(value === "true" ? "false" : "true")}
          className="h-11 w-full rounded-lg"
        >
          {value === "true" ? "✓ Выполнено" : "Отметить выполнение"}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            aria-label={`Факт за день: ${goal.title}, ${formatFactDate(date)}`}
            aria-describedby={`${id}-condition${error ? ` ${id}-error` : ""}`}
            aria-invalid={Boolean(value && error)}
            className="h-11 min-w-0 rounded-lg text-base md:text-base"
            type={goal.tracking.type === "time" ? "time" : "number"}
            value={value}
            min={goal.tracking.type === "scale" ? goal.tracking.min : undefined}
            max={goal.tracking.type === "scale" ? goal.tracking.max : undefined}
            step={goal.tracking.type === "scale" ? 1 : "any"}
            disabled={!editable || pending}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={
              goal.tracking.type === "quantity" ? String(goal.tracking.targetValue) : undefined
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSave();
              }
            }}
          />
          {goal.tracking.type === "quantity" && goal.tracking.unit && (
            <span className="max-w-24 break-words text-sm">{goal.tracking.unit}</span>
          )}
        </div>
      )}
      {editable && error && (
        <p
          id={`${id}-error`}
          role={value ? "alert" : undefined}
          className={`text-sm ${value ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error}
        </p>
      )}
      <div className="flex items-start gap-2">
        <Button
          className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal rounded-lg"
          disabled={!editable || pending || Boolean(error)}
          isLoading={savePending}
          loadingLabel="Сохраняем"
          onClick={onSave}
        >
          Сохранить результат и заметку
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-lg"
          disabled={!hasEntry || !editable || pending}
          isLoading={deletePending}
          loadingLabel="Удаляем"
          onClick={onDelete}
          aria-label={`Удалить результат и заметку: ${goal.title}, ${formatFactDate(date)}`}
        >
          <Trash2 />
        </Button>
      </div>
    </section>
  );
}
