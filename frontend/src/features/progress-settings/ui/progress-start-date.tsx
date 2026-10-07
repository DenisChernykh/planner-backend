import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Pencil, X } from "lucide-react";
import { useState } from "react";
import { putApiProgressSettings } from "@/shared/api";
import { formatPlannerDay } from "@/shared/lib/planner-calendar";
import { Button, TextField } from "@/shared/ui";

export function ProgressStartDate({ startsOn }: { startsOn: string | null }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(startsOn ?? "");
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => putApiProgressSettings({ startsOn: draft || null }),
    onSuccess: async () => {
      await client.invalidateQueries({
        predicate: (query) =>
          /\/api\/(?:progress|plans|reminders\/progress-reports)/u.test(String(query.queryKey[0])),
      });
      setOpen(false);
    },
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setDraft(startsOn ?? "");
          save.reset();
        }
      }}
    >
      <Dialog.Trigger className="flex w-full items-center gap-3 rounded-xl bg-primary-soft px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto">
        <CalendarDays className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <strong className="block text-xs">
            {startsOn
              ? `Учитываем с ${formatPlannerDay(startsOn)} ${startsOn.slice(0, 4)}`
              : "Учитываем всю историю"}
          </strong>
          <span className="mt-1 block text-xs text-muted-foreground">
            Ранние записи сохранены в плане
          </span>
        </span>
        <Pencil className="size-4 shrink-0 text-primary" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/20" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card p-6 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-lg font-bold">Учитывать прогресс с</Dialog.Title>
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 rounded-lg"
                  aria-label="Закрыть"
                />
              }
            >
              <X />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Более ранние записи сохранятся в плане и не будут влиять на статистику. Одна дата
            действует для всех целей и отчётов.
          </Dialog.Description>
          <form
            className="mt-5 space-y-4 [&_[data-slot=button]]:min-h-11 [&_[data-slot=button]]:rounded-lg [&_[data-slot=input]]:h-11 [&_[data-slot=input]]:rounded-lg"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <TextField
              label="Дата начала учёта"
              type="date"
              value={draft}
              disabled={save.isPending}
              onChange={(event) => {
                setDraft(event.target.value);
                save.reset();
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => {
                setDraft("");
                save.reset();
              }}
            >
              Учитывать всю историю
            </Button>
            {save.isError && (
              <p role="alert" className="text-sm text-destructive">
                Не удалось сохранить дату. Проверьте её и повторите попытку.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close render={<Button variant="outline" />} disabled={save.isPending}>
                Отмена
              </Dialog.Close>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Сохраняем…" : "Сохранить"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
