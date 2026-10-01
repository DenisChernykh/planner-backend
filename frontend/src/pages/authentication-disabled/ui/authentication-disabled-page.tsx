import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui";

/** Shows the documented Hono behavior for AUTH_MODE=disabled. */
export function AuthenticationDisabledPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Авторизация выключена</CardTitle>
          <CardDescription>Вход через Telegram пока недоступен.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Сейчас нельзя открыть личный план. Попробуйте зайти позже.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
