import { Trash2 } from "lucide-react";

import type { GetApiPlansMonth200GoalsItem } from "@/shared/api";
import { Button, Input } from "@/shared/ui";

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
}: FactValueEditorProps) {
  const Icon = trackingIconMap[goal.tracking.type];
  const emptyNumericValue = goal.tracking.type !== "check" && value.trim() === "";
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
          className="w-full"
        >
          {value === "true" ? "✓ Выполнено" : "Отметить выполнение"}
        </Button>
      )}
      {goal.tracking.type === "quantity" && (
        <Input
          type="number"
          value={value}
          disabled={!editable}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={`до ${goal.tracking.targetValue}`}
        />
      )}
      {goal.tracking.type === "scale" && (
        <Input
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
          type="time"
          value={value}
          disabled={!editable}
          onChange={(event) => onValueChange(event.target.value)}
        />
      )}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!editable || savePending || emptyNumericValue}
          isLoading={savePending}
          loadingLabel="Сохраняем"
          onClick={onSave}
        >
          Сохранить факт
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={!hasEntry || !editable || deletePending}
          isLoading={deletePending}
          loadingLabel="Удаляем"
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
