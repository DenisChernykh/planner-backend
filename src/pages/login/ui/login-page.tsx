import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { useCurrentSession } from "@/entities/session";
import { TelegramLoginLink } from "@/features/authentication";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Spinner } from "@/shared/ui";

export function LoginPage() {
  const session = useCurrentSession();

  if (session.kind === "loading") {
    return (
      <LoginFrame>
        <Spinner aria-label="Проверяем вход" />
      </LoginFrame>
    );
  }

  if (session.kind === "disabled") return <Navigate to="/authentication-disabled" replace />;
  if (session.kind === "authenticated") return <Navigate to="/" replace />;

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
      <TelegramLoginLink />
    </LoginFrame>
  );
}

function LoginFrame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Апрель</CardTitle>
          <CardDescription>Войдите через Telegram, чтобы открыть личные заметки.</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
