import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  deleteApiGoalsGoalIdEntriesDate,
  type GetApiPlansMonth200GoalsItem,
  getApiProblem,
  getGetApiPlansMonthQueryKey,
  type PutApiGoalsGoalIdEntriesDateBody,
  putApiGoalsGoalIdEntriesDate,
} from "@/shared/api";
import { isPlannerDateEditable } from "@/shared/lib/planner-calendar";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  Button,
} from "@/shared/ui";
import { formatEntryValue, formatFactDate } from "../model/plan-model";
import { DraftExitDialog, DraftNavigationGuard } from "./draft-exit-dialog";
import { setFactInCache } from "./fact-cache";
import { FactDateControls } from "./fact-date-controls";
import { buildFactPayload, initialFactValue } from "./fact-inspector-model";
import { FactNote } from "./fact-note";
import { FactValueEditor } from "./fact-value-editor";
import { FactWeekHistory } from "./fact-week-history";
import { isQuickFactValueValid } from "./quick-fact-model";

type Goal = GetApiPlansMonth200GoalsItem;
type Entry = Goal["entries"][number];
type FactOperation =
  | { kind: "save"; data: PutApiGoalsGoalIdEntriesDateBody }
  | { kind: "delete"; revision: string };

export function FactInspectorDraft({
  goal,
  date,
  month,
  today,
  onDateChange,
  onClose,
  children,
}: {
  goal: Goal;
  date: string;
  month: string;
  today: string;
  onDateChange: (date: string) => void;
  onClose: () => void;
  children: (content: ReactNode, actions: { requestClose: () => void }) => ReactNode;
}) {
  const client = useQueryClient();
  const entry = goal.entries.find((item) => item.date === date);
  const makeDraft = (base: Entry | undefined) => ({
    base,
    value: initialFactValue({ ...goal, entries: base ? [base] : [] }, date),
    note: base?.note ?? "",
  });
  const [draft, setDraft] = useState(() => makeDraft(entry));
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState("");
  const explicitExit = useRef(false);
  const editable = isPlannerDateEditable(date, today, month);
  const original = makeDraft(draft.base);
  const dirty = draft.value !== original.value || draft.note !== original.note;
  const mutation = useMutation({
    mutationFn: async (operation: FactOperation) => {
      if (operation.kind === "delete") {
        await deleteApiGoalsGoalIdEntriesDate(
          { goalId: goal.id, date },
          { expectedRevision: operation.revision },
        );
        return { operation, saved: undefined };
      }
      const response = await putApiGoalsGoalIdEntriesDate(
        { goalId: goal.id, date },
        operation.data,
      );
      return { operation, saved: response.entry };
    },
    onSuccess: ({ operation, saved }) => {
      setFactInCache(client, month, goal.id, date, saved);
      setDraft(makeDraft(saved));
      setConfirmDelete(false);
      setStatus(
        `${operation.kind === "delete" ? "Результат и заметка удалены" : "Результат и заметка сохранены"} · ${formatFactDate(date)}`,
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: getGetApiPlansMonthQueryKey({ month }) }),
  });
  useEffect(() => {
    if (!dirty && !mutation.isPending && entry?.revision !== draft.base?.revision) {
      setDraft({ base: entry, value: initialFactValue(goal, date), note: entry?.note ?? "" });
    }
  }, [entry, goal, date, dirty, mutation.isPending, draft.base?.revision]);
  useEffect(() => {
    if (!dirty && !mutation.isPending) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, mutation.isPending]);
  const save = async (): Promise<boolean> => {
    if (!editable || mutation.isPending || !isQuickFactValueValid(goal, draft.value)) return false;
    try {
      await mutation.mutateAsync({
        kind: "save",
        data: buildFactPayload(goal, draft.value, draft.note, draft.base?.revision ?? null),
      });
      return true;
    } catch {
      return false;
    }
  };
  const requestExit = (action: () => void) => {
    if (mutation.isPending) return;
    if (dirty) setLeaveAction(() => action);
    else action();
  };
  const conflict = mutation.isError && getApiProblem(mutation.error)?.status === 409;
  return children(
    <>
      <FactDateControls
        date={date}
        month={month}
        onDateChange={(next) => requestExit(() => onDateChange(next))}
      />
      <p
        role="status"
        className={`bg-card px-4 py-2 text-sm ${dirty ? "text-primary" : "text-muted-foreground"}`}
      >
        {dirty
          ? "Есть несохранённые изменения"
          : status || "Результат и заметка сохраняются одной кнопкой"}
      </p>
      <FactValueEditor
        goal={goal}
        date={date}
        value={draft.value}
        editable={editable}
        hasEntry={Boolean(draft.base)}
        savePending={mutation.isPending && mutation.variables?.kind === "save"}
        deletePending={mutation.isPending && mutation.variables?.kind === "delete"}
        saveError={false}
        deleteError={false}
        onValueChange={(value) => {
          explicitExit.current = false;
          setDraft((current) => ({ ...current, value }));
        }}
        onSave={() => void save()}
        onDelete={() => setConfirmDelete(true)}
      />
      <FactNote
        note={draft.note}
        editable={editable}
        pending={mutation.isPending}
        onChange={(note) => {
          explicitExit.current = false;
          setDraft((current) => ({ ...current, note }));
        }}
      />
      {mutation.isError && (
        <div role="alert" className="space-y-3 bg-card p-4 text-sm text-destructive">
          <p>
            {conflict
              ? "Результат изменился в другом окне или Telegram. Ваш черновик сохранён. Сравните записи перед повторным сохранением."
              : `Не удалось ${mutation.variables?.kind === "delete" ? "удалить" : "сохранить"} результат и заметку. Черновик сохранён, повторите попытку.`}
          </p>
          {conflict && (
            <>
              <p className="break-words text-foreground">
                На сервере:{" "}
                {entry ? formatEntryValue(goal, entry) || "не выполнено" : "результат удалён"}.
                Заметка: {entry?.note || "нет"}.
              </p>
              <Button
                variant="outline"
                className="h-auto min-h-11 whitespace-normal"
                onClick={() => {
                  setDraft(makeDraft(entry));
                  mutation.reset();
                }}
              >
                Загрузить актуальный результат и заметку
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-11 whitespace-normal"
                onClick={() => {
                  setDraft((current) => ({ ...current, base: entry }));
                  mutation.reset();
                }}
              >
                Продолжить с моим черновиком
              </Button>
              {draft.note !== original.note && (
                <Button
                  variant="outline"
                  className="h-auto min-h-11 whitespace-normal"
                  onClick={() => {
                    setDraft((current) => ({ ...makeDraft(entry), note: current.note }));
                    mutation.reset();
                  }}
                >
                  Оставить актуальный результат и мою заметку
                </Button>
              )}
            </>
          )}
        </div>
      )}
      <FactWeekHistory
        goal={goal}
        date={date}
        month={month}
        today={today}
        onDateChange={(next) => requestExit(() => onDateChange(next))}
      />
      <DraftNavigationGuard
        dirty={dirty || mutation.isPending}
        pending={mutation.isPending}
        onSave={save}
        explicitExit={explicitExit}
      />
      {leaveAction && (
        <DraftExitDialog
          pending={mutation.isPending}
          onSave={save}
          onCancel={() => setLeaveAction(null)}
          onLeave={() => {
            explicitExit.current = true;
            leaveAction();
            setLeaveAction(null);
          }}
        />
      )}
      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!mutation.isPending) setConfirmDelete(open);
        }}
      >
        <AlertDialogContent className="rounded-xl">
          <AlertDialogTitle>Удалить результат и заметку?</AlertDialogTitle>
          <AlertDialogDescription>
            Цель «{goal.title}», {formatFactDate(date)}. Будут удалены результат
            {draft.base?.note || draft.note
              ? " и текст заметки"
              : " и связанная заметка, если она есть"}
            . Несохранённые изменения также будут отброшены. Цель останется в плане.
          </AlertDialogDescription>
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {conflict
                ? "Запись изменилась. Отмените удаление и сравните актуальную запись с черновиком."
                : "Удаление не удалось. Можно повторить попытку."}
            </p>
          )}
          <Button
            variant="destructive"
            disabled={mutation.isPending || conflict}
            onClick={() => {
              if (draft.base) mutation.mutate({ kind: "delete", revision: draft.base.revision });
            }}
          >
            Удалить результат и заметку
          </Button>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => setConfirmDelete(false)}
          >
            Отмена
          </Button>
        </AlertDialogContent>
      </AlertDialog>
    </>,
    { requestClose: () => requestExit(onClose) },
  );
}
