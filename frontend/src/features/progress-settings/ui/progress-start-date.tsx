import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, History, Pencil, X } from "lucide-react";
import { useState } from "react";
import { putApiProgressSettings } from "@/shared/api";
import { formatPlannerDay } from "@/shared/lib/planner-calendar";
import { Button, DateField, isCivilDate } from "@/shared/ui";

export function ProgressStartDate({ startsOn, today }: { startsOn: string | null; today: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(startsOn ?? "");
  const [saved, setSaved] = useState(false);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => putApiProgressSettings({ startsOn: draft || null }),
    onSuccess: async () => {
      await client.invalidateQueries({
        predicate: (query) =>
          /\/api\/(?:progress|plans|reminders\/progress-reports)/u.test(String(query.queryKey[0])),
      });
      setOpen(false);
      setSaved(true);
    },
  });
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (save.isPending) return;
        setOpen(value);
        if (value) {
          setDraft(startsOn ?? "");
          save.reset();
          setSaved(false);
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
          <span className="mt-1 block text-xs text-muted-foreground" aria-live="polite">
            {saved ? "Дата сохранена · статистика обновлена" : "Ранние записи сохранены в плане"}
          </span>
        </span>
        <Pencil className="size-4 shrink-0 text-primary" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/20" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 max-h-[95svh] overflow-y-auto rounded-t-2xl border bg-card p-5 shadow-xl sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100svh-2rem)] sm:w-[520px] sm:max-w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-[17px] font-bold sm:text-lg">
              Учитывать прогресс с
            </Dialog.Title>
            <Dialog.Close
              disabled={save.isPending}
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
              if (!draft || isCivilDate(draft)) save.mutate();
            }}
          >
            <DateField
              label="Дата начала учёта"
              value={draft}
              disabled={save.isPending}
              expanded
              today={today}
              onChange={(value) => {
                setDraft(value);
                save.reset();
              }}
            />
            {draft && isCivilDate(draft) && draft > today && (
              <p className="rounded-lg bg-primary-soft p-3 text-xs">
                Учёт начнётся {formatPlannerDay(draft)} {draft.slice(0, 4)}. До этой даты отчёты не
                отправляются.
              </p>
            )}
            {save.isError && (
              <p role="alert" className="text-sm text-destructive">
                Не удалось сохранить дату. Проверьте её и повторите попытку.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Dialog.Close render={<Button variant="outline" />} disabled={save.isPending}>
                Отмена
              </Dialog.Close>
              <Button
                type="submit"
                disabled={save.isPending || Boolean(draft && !isCivilDate(draft))}
              >
                {save.isPending ? "Сохраняем…" : "Сохранить"}
                <Check className="size-4" />
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full text-primary"
              disabled={save.isPending}
              onClick={() => {
                setDraft("");
                save.reset();
              }}
            >
              Учитывать всю историю
              <History className="size-4" />
            </Button>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
