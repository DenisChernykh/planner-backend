import { Dialog } from "@base-ui/react/dialog";
import { ListFilter, X } from "lucide-react";
import { useState } from "react";
import type { ProgressGoal } from "@/shared/api";
import { Button, TextField } from "@/shared/ui";

export function GoalFilter({
  goals,
  selected,
  onApply,
}: {
  goals: ProgressGoal[];
  selected: string[] | null;
  onApply: (ids: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const unique = [...new Map(goals.map((goal) => [goal.chainId, goal])).values()];
  const visible = unique.filter((goal) =>
    goal.title.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")),
  );
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setDraft(selected ?? unique.map((goal) => goal.id));
          setSearch("");
        }
      }}
    >
      <Dialog.Trigger render={<Button variant="outline" className="h-11 rounded-lg px-4" />}>
        <span>{selected === null ? "Все цели" : `Выбрано: ${selected.length}`}</span>
        <ListFilter className="size-4" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/20" />
        <Dialog.Popup className="fixed right-0 bottom-0 left-0 z-50 max-h-[85svh] overflow-y-auto rounded-t-2xl border bg-card p-5 shadow-xl sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[calc(100%-2rem)] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl [&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-lg [&_[data-slot=input]]:h-11 [&_[data-slot=input]]:rounded-lg">
          <div className="flex justify-between gap-3">
            <Dialog.Title className="text-lg font-bold">Цели для просмотра</Dialog.Title>
            <Dialog.Close
              render={<Button variant="ghost" size="icon" aria-label="Закрыть фильтр" />}
            >
              <X />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Этот фильтр меняет только просмотр статистики.
          </Dialog.Description>
          <div className="my-4">
            <TextField
              label="Поиск целей"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="mb-3 flex justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={!visible.length}
              onClick={() => setDraft([...new Set([...draft, ...visible.map((goal) => goal.id)])])}
            >
              {search ? `Выбрать найденные (${visible.length})` : "Выбрать все"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!visible.length}
              onClick={() =>
                setDraft(draft.filter((id) => !visible.some((goal) => goal.id === id)))
              }
            >
              {search ? "Снять найденные" : "Снять все"}
            </Button>
          </div>
          <div className="space-y-2">
            {visible.map((goal) => (
              <label
                key={goal.id}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  checked={draft.includes(goal.id)}
                  onChange={(event) =>
                    setDraft(
                      event.target.checked
                        ? [...draft, goal.id]
                        : draft.filter((id) => id !== goal.id),
                    )
                  }
                />
                <span className="min-w-0 break-words">{goal.title}</span>
              </label>
            ))}
            {!visible.length && (
              <p className="py-5 text-sm text-muted-foreground">Поиск не дал результатов</p>
            )}
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Dialog.Close render={<Button variant="outline" />}>Отмена</Dialog.Close>
            <Button
              onClick={() => {
                onApply(draft.length === unique.length ? null : draft);
                setOpen(false);
              }}
            >
              Применить
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
