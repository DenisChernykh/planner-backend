import { Navigate, Outlet, useLocation } from "react-router";

import { useCurrentSession } from "@/entities/session";
import { AuthenticationDisabledPage } from "@/pages/authentication-disabled";
import { getPlannerReturnTo } from "@/shared/lib/planner-return-to";
import { Card, CardContent, CardHeader, CardTitle, Spinner } from "@/shared/ui";

/** Blocks personal UI for anonymous, disabled, and unknown sessions. */
export function SessionGate() {
  const session = useCurrentSession();
  const location = useLocation();

  if (session.kind === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner aria-label="Проверяем вход" />
      </main>
    );
  }

  if (session.kind === "authenticated") return <Outlet />;
  if (session.kind === "anonymous") {
    const returnTo = getPlannerReturnTo(`${location.pathname}${location.search}${location.hash}`);
    return (
      <Navigate to={returnTo ? `/login?${new URLSearchParams({ returnTo })}` : "/login"} replace />
    );
  }
  if (session.kind === "disabled") return <AuthenticationDisabledPage />;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Не удалось открыть приложение</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Проверьте соединение и попробуйте ещё раз.</p>
        </CardContent>
      </Card>
    </main>
  );
}
