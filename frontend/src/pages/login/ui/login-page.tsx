import type { ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router";

import { useCurrentSession } from "@/entities/session";
import { TelegramLoginLink } from "@/features/authentication";
import { getPlannerReturnTo } from "@/shared/lib/planner-return-to";
import { useAppRuntime } from "@/shared/lib/runtime";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Spinner } from "@/shared/ui";

export function LoginPage() {
  const embedded = useAppRuntime() === "chatgpt";
  const session = useCurrentSession();
  const [params] = useSearchParams();
  const returnTo = getPlannerReturnTo(params.get("returnTo"));

  if (session.kind === "loading") {
    return (
      <LoginFrame>
        <Spinner aria-label="Проверяем вход" />
      </LoginFrame>
    );
  }

  if (session.kind === "disabled") return <Navigate to="/authentication-disabled" replace />;
  if (session.kind === "authenticated") return <Navigate to={returnTo ?? "/"} replace />;

  if (session.kind === "error") {
    return (
      <LoginFrame>
        <p className="text-sm text-destructive">
          Не удалось проверить состояние входа. Повторите попытку.
        </p>
      </LoginFrame>
    );
  }

  return (
    <LoginFrame>
      {embedded ? (
        <p className="text-sm">
          Проверьте ключ подключения в настройках плагина. Создать или заменить его можно в разделе
          «Подключения» веб-версии Ритма.
        </p>
      ) : (
        <TelegramLoginLink returnTo={returnTo} />
      )}
    </LoginFrame>
  );
}

function LoginFrame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Ритм</CardTitle>
          <CardDescription>Цели, привычки и результаты в вашем темпе.</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
