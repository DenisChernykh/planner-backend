import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  deleteApiGoalsGoalIdEntriesDate,
  type GetApiPlansMonth200GoalsItem,
  getGetApiPlansMonthQueryKey,
  type PutApiGoalsGoalIdEntriesDateBody,
  putApiGoalsGoalIdEntriesDate,
} from "@/shared/api";
import { isPlannerDateEditable } from "@/shared/lib/planner-calendar";
import { Button } from "@/shared/ui";
import { getTrackingLabel } from "../model/plan-model";
import { setFactInCache } from "./fact-cache";
import { FactDateControls } from "./fact-date-controls";
import { buildFactPayload, initialFactValue } from "./fact-inspector-model";
import { FactNote } from "./fact-note";
import { FactValueEditor } from "./fact-value-editor";
import { FactWeekHistory } from "./fact-week-history";
import { trackingIconMap } from "./tracking-presentation";

type FactInspectorProps = {
  goal: GetApiPlansMonth200GoalsItem;
  date: string;
  month: string;
  today: string;
  onDateChange: (date: string) => void;
  onClose: () => void;
};

export function FactInspector({
  goal,
  date,
  month,
  today,
  onDateChange,
  onClose,
}: FactInspectorProps) {
  const queryClient = useQueryClient();
  const entry = goal.entries.find((item) => item.date === date);
  const [value, setValue] = useState(() => initialFactValue(goal, date));
  const [note, setNote] = useState(() => entry?.note ?? "");
  const editable = isPlannerDateEditable(date, today, month);
  const Icon = trackingIconMap[goal.tracking.type];
  const save = useMutation({
    mutationFn: (data: PutApiGoalsGoalIdEntriesDateBody) =>
      putApiGoalsGoalIdEntriesDate({ goalId: goal.id, date }, data),
    onSuccess: ({ entry: saved }) => setFactInCache(queryClient, month, goal.id, date, saved),
    onSettled: () =>
      void queryClient.invalidateQueries({
        queryKey: getGetApiPlansMonthQueryKey({ month }),
      }),
  });
  const remove = useMutation({
    mutationFn: () => deleteApiGoalsGoalIdEntriesDate({ goalId: goal.id, date }),
    onSuccess: () => setFactInCache(queryClient, month, goal.id, date, undefined),
    onSettled: () =>
      void queryClient.invalidateQueries({
        queryKey: getGetApiPlansMonthQueryKey({ month }),
      }),
  });
  const saveFact = (nextNote = note) => {
    if (!editable || (goal.tracking.type !== "check" && value.trim() === "")) return;
    save.mutate(buildFactPayload(goal, value, nextNote));
  };

  return (
    <aside
      className="flex h-full min-h-[560px] w-[320px] shrink-0 flex-col border-l bg-secondary"
      aria-label="Инспектор факта"
    >
      <header className="space-y-3 border-b bg-card p-5">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-primary-soft px-2 py-1 text-[0.65rem] font-bold text-primary">
            ВЫБРАНО
          </span>
          <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Закрыть инспектор">
            ×
          </Button>
        </div>
        <h2 className="text-base font-bold">{goal.title}</h2>
        <p className="flex items-center gap-2 text-[0.68rem] text-muted-foreground">
          <Icon className="size-3.5" /> {getTrackingLabel(goal.tracking.type)}
        </p>
      </header>
      <FactDateControls date={date} month={month} onDateChange={onDateChange} />
      <FactValueEditor
        goal={goal}
        value={value}
        editable={editable}
        hasEntry={Boolean(entry)}
        savePending={save.isPending}
        deletePending={remove.isPending}
        saveError={save.isError}
        deleteError={remove.isError}
        onValueChange={setValue}
        onSave={() => saveFact()}
        onDelete={() => remove.mutate()}
      />
      <FactWeekHistory goal={goal} date={date} month={month} onDateChange={onDateChange} />
      <FactNote
        note={note}
        editable={editable}
        hasEntry={Boolean(entry)}
        onChange={setNote}
        onBlur={() => {
          if (entry && note !== (entry.note ?? "")) saveFact(note);
        }}
      />
    </aside>
  );
}
