import { getPlannerReturnTo } from "@/shared/lib/planner-return-to";
import { Button } from "@/shared/ui";

/** Starts the browser redirect to Telegram OIDC through Hono. */
export function TelegramLoginLink({ returnTo }: { returnTo?: string | null }) {
  const destination = getPlannerReturnTo(returnTo ?? null);
  const href = destination
    ? `/api/auth/telegram/start?${new URLSearchParams({ returnTo: destination })}`
    : "/api/auth/telegram/start";
  return <Button render={<a href={href} />}>Войти через Telegram</Button>;
}
