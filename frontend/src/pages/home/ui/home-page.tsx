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
          <CardTitle>Ритм</CardTitle>
          <CardDescription>Вы вошли как {name}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ваши цели, привычки и результаты — в одном месте.
          </p>
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  );
}
