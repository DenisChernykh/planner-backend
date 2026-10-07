import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteApiRemindersTelegram,
  type GetApiRemindersSettings200,
  getGetApiRemindersSettingsQueryKey,
  postApiRemindersTelegramConnect,
} from "@/shared/api";
import { useExternalNavigation } from "@/shared/lib/runtime";
import { Button, buttonVariants } from "@/shared/ui";

export function TelegramConnection({ state }: { state: GetApiRemindersSettings200 }) {
  const client = useQueryClient();
  const navigateExternal = useExternalNavigation();
  const openLink = useMutation({ mutationFn: async (url: string) => navigateExternal?.(url) });
  const connect = useMutation({ mutationFn: () => postApiRemindersTelegramConnect() });
  const disconnect = useMutation({
    mutationFn: () => deleteApiRemindersTelegram(),
    onSuccess: async () => {
      connect.reset();
      openLink.reset();
      await client.invalidateQueries({ queryKey: getGetApiRemindersSettingsQueryKey() });
    },
  });
  const connected = state.connection === "active";
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="text-base font-bold">Telegram</h2>
      <p className="text-sm text-muted-foreground">
        {connected
          ? "Чат подключён. Отвечайте на вопросы бота, чтобы заполнять план."
          : state.connection === "blocked"
            ? "Доставка приостановлена. Разблокируйте бота в Telegram и подключите его заново."
            : "Подключите личный чат, чтобы получать вопросы и записывать ответы прямо в Telegram."}
      </p>
      {!state.botAvailable && (
        <p className="text-sm text-muted-foreground">
          Бот пока не включён. Настройки можно сохранить заранее.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {!connected && (
          <Button
            disabled={!state.botAvailable || connect.isPending}
            onClick={() => connect.mutate()}
          >
            {connect.isPending ? "Готовим ссылку…" : "Подключить Telegram"}
          </Button>
        )}
        {state.connection !== "disconnected" && (
          <Button
            variant="outline"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            Отключить Telegram
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() =>
            client.invalidateQueries({ queryKey: getGetApiRemindersSettingsQueryKey() })
          }
        >
          Обновить статус
        </Button>
      </div>
      {connect.data && !connected && (
        <div className="space-y-2">
          <a
            className={buttonVariants({ variant: "outline" })}
            href={connect.data.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              if (!navigateExternal) return;
              event.preventDefault();
              openLink.mutate(connect.data.url);
            }}
          >
            Открыть бота в Telegram
          </a>
          <p className="text-xs text-muted-foreground">
            Нажмите Start, затем «Подключить» в чате. Ссылка действует 10 минут.
          </p>
        </div>
      )}
      {(connect.isError || disconnect.isError) && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось изменить подключение. Попробуйте ещё раз.
        </p>
      )}
      {openLink.isError && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось открыть Telegram. Попробуйте ещё раз.
        </p>
      )}
      {state.deliveryIssues > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Сообщения за последние 24 часа с ошибкой или неподтверждённой доставкой:{" "}
          {state.deliveryIssues}. Проверьте чат в Telegram. Пропущенные записи можно заполнить в
          плане.
        </p>
      )}
    </section>
  );
}
