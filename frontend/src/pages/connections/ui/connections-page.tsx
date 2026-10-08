import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import {
  deleteApiIntegrationsChatgpt,
  getApiIntegrationsChatgpt,
  postApiIntegrationsChatgpt,
} from "@/shared/api";
import { Alert, AlertDescription, Button } from "@/shared/ui";
import { PlannerShell } from "@/widgets/planner-shell";

const key = ["/api/integrations/chatgpt"];

export function ConnectionsPage() {
  const month = useParams().month as string;
  const client = useQueryClient();
  const connection = useQuery({
    queryKey: key,
    queryFn: () => getApiIntegrationsChatgpt(),
    retry: false,
  });
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const issue = useMutation({
    mutationFn: () => postApiIntegrationsChatgpt({}),
    onSuccess: async (data) => {
      setToken(data.token);
      setCopied(false);
      setCopyFailed(false);
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const revoke = useMutation({
    mutationFn: () => deleteApiIntegrationsChatgpt(),
    onSuccess: async () => {
      setToken(null);
      issue.reset();
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const copy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  };
  const pending = issue.isPending || revoke.isPending;
  return (
    <PlannerShell month={month}>
      <div className="mx-auto max-w-3xl space-y-6 px-5 py-8 sm:px-8">
        <div>
          <h1 className="text-2xl font-bold">Подключения</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ритм в ChatGPT — ваш план рядом с разговором.
          </p>
        </div>
        <section
          className="space-y-5 rounded-xl border bg-card p-6"
          aria-labelledby="chatgpt-title"
        >
          <h2 id="chatgpt-title" className="text-lg font-bold">
            ChatGPT
          </h2>
          <p className="text-sm">
            Просматривайте план, создавайте цели и записывайте результаты в чате или в знакомом
            интерфейсе Ритма.
          </p>
          {connection.isPending ? (
            <p role="status">Проверяем подключение…</p>
          ) : connection.data?.connection ? (
            <p className="text-sm">
              Ключ действует до{" "}
              {new Date(connection.data.connection.expiresAt).toLocaleDateString("ru-RU")}.
            </p>
          ) : connection.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Не удалось проверить подключение.{" "}
                <Button variant="outline" onClick={() => connection.refetch()}>
                  Повторить
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">Ключ ещё не создан.</p>
          )}
          <p className="text-sm text-muted-foreground">
            Ключ показывается один раз и действует год. Новый ключ сразу заменит предыдущий. Выход
            из веб-версии не отключает плагин.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                setToken(null);
                issue.mutate();
              }}
              disabled={pending || connection.isPending || connection.isError}
              isLoading={issue.isPending}
            >
              {connection.data?.connection ? "Создать новый ключ" : "Создать ключ"}
            </Button>
            {connection.data?.connection && (
              <Button
                variant="outline"
                onClick={() => revoke.mutate()}
                disabled={pending}
                isLoading={revoke.isPending}
              >
                Отозвать доступ
              </Button>
            )}
          </div>
          {(issue.isError || revoke.isError) && (
            <Alert variant="destructive">
              <AlertDescription>
                Не удалось изменить подключение. Проверьте его состояние перед повторной попыткой.
              </AlertDescription>
            </Alert>
          )}
          {token && (
            <div className="space-y-3 rounded-lg border p-4">
              <label htmlFor="chatgpt-key" className="text-sm font-medium">
                Ваш ключ подключения
              </label>
              <textarea
                id="chatgpt-key"
                readOnly
                value={token}
                autoComplete="off"
                spellCheck={false}
                className="w-full resize-none rounded-md border bg-background p-3 text-sm"
              />
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => void copy()}>
                  {copied ? "Скопировано" : "Скопировать"}
                </Button>
                <Button variant="ghost" onClick={() => setToken(null)}>
                  Скрыть ключ
                </Button>
              </div>
              {copyFailed && (
                <p role="alert" className="text-sm">
                  Выделите ключ и скопируйте вручную.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Сохраните ключ в приватной настройке плагина. Не отправляйте его в чат.
              </p>
            </div>
          )}
        </section>
      </div>
    </PlannerShell>
  );
}
