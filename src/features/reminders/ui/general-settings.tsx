import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getApiProblem,
  getGetApiRemindersSettingsQueryKey,
  type PutApiRemindersSettingsBody,
  putApiRemindersSettings,
} from "@/shared/api";
import { Button, TextField } from "@/shared/ui";

export function GeneralSettings({ initial }: { initial: PutApiRemindersSettingsBody }) {
  const [draft, setDraft] = useState<PutApiRemindersSettingsBody>(() => ({
    enabled: initial.enabled,
    timeZone: initial.timeZone,
    quietStart: initial.quietStart,
    quietEnd: initial.quietEnd,
    eveningTime: initial.eveningTime,
  }));
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (data: PutApiRemindersSettingsBody) => putApiRemindersSettings(data),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: getGetApiRemindersSettingsQueryKey() });
      await client.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith("/api/plans/"),
      });
    },
  });
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(draft);
      }}
    >
      <h2 className="text-base font-bold">Время и напоминания</h2>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
          className="size-4 accent-primary"
        />
        Присылать напоминания
      </label>
      <TextField
        label="Часовой пояс"
        value={draft.timeZone}
        required
        list="planner-time-zones"
        description="Используется и в плане, и в Telegram."
        onChange={(event) => setDraft({ ...draft, timeZone: event.target.value })}
      />
      <datalist id="planner-time-zones">
        {[
          "Asia/Yekaterinburg",
          "Europe/Moscow",
          "Europe/Kaliningrad",
          "Asia/Novosibirsk",
          "Asia/Vladivostok",
          "Europe/Berlin",
          "UTC",
        ].map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setDraft({ ...draft, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
        }
      >
        Использовать часовой пояс устройства
      </Button>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          type="time"
          label="Тихие часы с"
          required
          value={draft.quietStart}
          onChange={(event) => setDraft({ ...draft, quietStart: event.target.value })}
        />
        <TextField
          type="time"
          label="Тихие часы до"
          required
          value={draft.quietEnd}
          onChange={(event) => setDraft({ ...draft, quietEnd: event.target.value })}
        />
        <TextField
          type="time"
          label="Вечерний сбор"
          required
          value={draft.eveningTime}
          onChange={(event) => setDraft({ ...draft, eveningTime: event.target.value })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        В тихие часы вопросы откладываются до их окончания. Одинаковое время начала и конца
        отключает тихие часы.
      </p>
      {save.isError && (
        <p role="alert" className="text-sm text-destructive">
          {getApiProblem(save.error)?.status === 400
            ? "Проверьте часовой пояс и время."
            : "Не удалось сохранить настройки."}
        </p>
      )}
      {save.isSuccess && (
        <p role="status" className="text-sm text-success">
          Настройки сохранены
        </p>
      )}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? "Сохраняем…" : "Сохранить настройки"}
      </Button>
    </form>
  );
}
