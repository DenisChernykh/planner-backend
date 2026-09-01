import { useCurrentSession } from "@/entities/session";
import { LogoutButton } from "@/features/authentication";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui";

export function HomePage() {
  const session = useCurrentSession();
  if (session.kind !== "authenticated") return null;

  const name = session.user.displayName ?? session.user.username ?? "пользователь";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Апрель</CardTitle>
          <CardDescription>Вы вошли как {name}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Приложение отдаётся Cloudflare Worker, а API остаётся на том же origin в Hono backend.
          </p>
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  );
}
