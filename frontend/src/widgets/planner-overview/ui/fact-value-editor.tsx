import { Trash2 } from "lucide-react";

import type { GetApiPlansMonth200GoalsItem } from "@/shared/api";
import { Button, Input } from "@/shared/ui";

import { isQuickFactValueValid } from "./quick-fact-model";
import { trackingIconMap } from "./tracking-presentation";

type FactValueEditorProps = {
  goal: GetApiPlansMonth200GoalsItem;
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
  onDeleteIntent: () => void;
};

export function FactValueEditor({
  goal,
  value,
  editable,
  hasEntry,
  savePending,
  deletePending,
  saveError,
  deleteError,
  onValueChange,
  onSave,
  onDelete,
  onDeleteIntent,
}: FactValueEditorProps) {
  const Icon = trackingIconMap[goal.tracking.type];
  const valueValid = isQuickFactValueValid(goal, value);
  return (
    <section className="space-y-3 border-b bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[0.65rem] font-bold tracking-wide text-muted-foreground">
          <Icon className="size-3.5" /> ФАКТ ЗА ДЕНЬ
        </h3>
        <span className="text-[0.65rem] text-muted-foreground">
          {editable ? "доступен" : "только просмотр"}
        </span>
      </div>
      {goal.tracking.type === "check" && (
        <Button
          variant={value === "true" ? "default" : "outline"}
          disabled={!editable || savePending}
          onClick={() => onValueChange(value === "true" ? "false" : "true")}
          className="h-11 w-full rounded-lg lg:h-8 lg:rounded-none"
        >
          {value === "true" ? "✓ Выполнено" : "Отметить выполнение"}
        </Button>
      )}
      {goal.tracking.type === "quantity" && (
        <Input
          aria-label="Факт за день"
          className="h-11 rounded-lg text-base lg:h-8 lg:rounded-none lg:text-xs"
          type="number"
          value={value}
          disabled={!editable}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={`до ${goal.tracking.targetValue}`}
        />
      )}
      {goal.tracking.type === "scale" && (
        <Input
          aria-label="Факт за день"
          className="h-11 rounded-lg text-base lg:h-8 lg:rounded-none lg:text-xs"
          type="number"
          min={goal.tracking.min}
          max={goal.tracking.max}
          value={value}
          disabled={!editable}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={`${goal.tracking.min}–${goal.tracking.max}`}
        />
      )}
      {goal.tracking.type === "time" && (
        <Input
          aria-label="Факт за день"
          className="h-11 rounded-lg text-base lg:h-8 lg:rounded-none lg:text-xs"
          type="time"
          value={value}
          disabled={!editable}
          onChange={(event) => onValueChange(event.target.value)}
        />
      )}
      <div className="flex gap-2">
        <Button
          className="h-11 min-w-0 flex-1 rounded-lg lg:h-8 lg:rounded-none"
          disabled={!editable || savePending || deletePending || !valueValid}
          isLoading={savePending}
          loadingLabel="Сохраняем"
          onClick={onSave}
        >
          Сохранить факт
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-11 rounded-lg lg:size-8 lg:rounded-none"
          disabled={!hasEntry || !editable || savePending || deletePending}
          isLoading={deletePending}
          loadingLabel="Удаляем"
          data-fact-delete
          onPointerDown={onDeleteIntent}
          onClick={onDelete}
          aria-label="Удалить факт"
        >
          <Trash2 />
        </Button>
      </div>
      {saveError && (
        <p className="text-xs text-destructive" role="alert">
          Не удалось сохранить факт. Повторите попытку.
        </p>
      )}
      {deleteError && (
        <p className="text-xs text-destructive" role="alert">
          Не удалось удалить факт. Повторите попытку.
        </p>
      )}
    </section>
  );
}
