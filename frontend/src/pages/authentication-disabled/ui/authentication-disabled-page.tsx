import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui";

/** Shows the documented Hono behavior for AUTH_MODE=disabled. */
export function AuthenticationDisabledPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Авторизация выключена</CardTitle>
          <CardDescription>Telegram login не настроен в текущем backend окружении.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            В этой версии Hono защищённые заметки также недоступны: backend отвечает 404 для API
            авторизации и заметок. Включите AUTH_MODE=telegram, чтобы работать с личными данными.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
