import { Navigate, Outlet } from "react-router";

import { useCurrentSession } from "@/entities/session";
import { AuthenticationDisabledPage } from "@/pages/authentication-disabled";
import { Card, CardContent, CardHeader, CardTitle, Spinner } from "@/shared/ui";

/** Blocks personal UI for anonymous, disabled, and unknown sessions. */
export function SessionGate() {
  const session = useCurrentSession();

  if (session.kind === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner aria-label="Проверяем вход" />
      </main>
    );
  }

  if (session.kind === "authenticated") return <Outlet />;
  if (session.kind === "anonymous") return <Navigate to="/login" replace />;
  if (session.kind === "disabled") return <AuthenticationDisabledPage />;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Не удалось открыть приложение</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Проверьте доступность Hono API и попробуйте ещё раз.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
