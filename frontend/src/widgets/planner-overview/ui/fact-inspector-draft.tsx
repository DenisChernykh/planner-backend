import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";

import {
  deleteApiGoalsGoalIdEntriesDate,
  type GetApiPlansMonth200GoalsItem,
  getGetApiPlansMonthQueryKey,
  type PutApiGoalsGoalIdEntriesDateBody,
  putApiGoalsGoalIdEntriesDate,
} from "@/shared/api";
import { isPlannerDateEditable } from "@/shared/lib/planner-calendar";

import { setFactInCache } from "./fact-cache";
import { FactDateControls } from "./fact-date-controls";
import { buildFactPayload, initialFactValue } from "./fact-inspector-model";
import { FactNote } from "./fact-note";
import { FactValueEditor } from "./fact-value-editor";
import { FactWeekHistory } from "./fact-week-history";
import { isQuickFactValueValid } from "./quick-fact-model";

type FactInspectorDraftProps = {
  goal: GetApiPlansMonth200GoalsItem;
  date: string;
  month: string;
  today: string;
  onDateChange: (date: string) => void;
  children: (content: ReactNode) => ReactNode;
};

type FactOperation = { kind: "save"; data: PutApiGoalsGoalIdEntriesDateBody } | { kind: "delete" };

function targetsDeleteAction(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.dataset.factDelete !== undefined;
}

export function FactInspectorDraft({
  goal,
  date,
  month,
  today,
  onDateChange,
  children,
}: FactInspectorDraftProps) {
  const queryClient = useQueryClient();
  const entry = goal.entries.find((item) => item.date === date);
  const [value, setValue] = useState(() => initialFactValue(goal, date));
  const [note, setNote] = useState(() => entry?.note ?? "");
  const deleteIntent = useRef(false);
  const editable = isPlannerDateEditable(date, today, month);
  const mutation = useMutation({
    mutationFn: async (operation: FactOperation) => {
      if (operation.kind === "delete") {
        await deleteApiGoalsGoalIdEntriesDate({ goalId: goal.id, date });
        return { operation };
      }
      const response = await putApiGoalsGoalIdEntriesDate(
        { goalId: goal.id, date },
        operation.data,
      );
      return { operation, entry: response.entry };
    },
    onSuccess: ({ operation, entry: saved }) => {
      if (operation.kind === "delete") {
        setFactInCache(queryClient, month, goal.id, date, undefined);
        return;
      }
      setFactInCache(queryClient, month, goal.id, date, saved);
    },
    onSettled: async () => {
      deleteIntent.current = false;
      await queryClient.invalidateQueries({ queryKey: getGetApiPlansMonthQueryKey({ month }) });
    },
  });
  const saveFact = (nextNote = note) => {
    if (
      !editable ||
      mutation.isPending ||
      deleteIntent.current ||
      !isQuickFactValueValid(goal, value)
    )
      return;
    mutation.mutate({ kind: "save", data: buildFactPayload(goal, value, nextNote) });
  };
  const deleteFact = () => {
    if (mutation.isPending) return;
    deleteIntent.current = true;
    mutation.mutate({ kind: "delete" });
  };
  const saving = mutation.isPending && mutation.variables?.kind === "save";
  const deleting = mutation.isPending && mutation.variables?.kind === "delete";

  return children(
    <>
      <FactDateControls date={date} month={month} onDateChange={onDateChange} />
      <FactValueEditor
        goal={goal}
        value={value}
        editable={editable}
        hasEntry={Boolean(entry)}
        savePending={saving}
        deletePending={deleting}
        saveError={mutation.isError && mutation.variables?.kind === "save"}
        deleteError={mutation.isError && mutation.variables?.kind === "delete"}
        onValueChange={setValue}
        onSave={() => saveFact()}
        onDelete={deleteFact}
        onDeleteIntent={() => {
          deleteIntent.current = true;
        }}
      />
      <FactWeekHistory goal={goal} date={date} month={month} onDateChange={onDateChange} />
      <FactNote
        note={note}
        editable={editable}
        hasEntry={Boolean(entry)}
        onChange={setNote}
        onBlur={(event) => {
          if (
            entry &&
            note !== (entry.note ?? "") &&
            !deleteIntent.current &&
            !targetsDeleteAction(event.relatedTarget)
          )
            saveFact(note);
        }}
      />
    </>,
  );
}
