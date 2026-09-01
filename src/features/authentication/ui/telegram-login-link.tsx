import { Button } from "@/shared/ui";

/** Starts the browser redirect to Telegram OIDC through Hono. */
export function TelegramLoginLink() {
  return <Button render={<a href="/api/auth/telegram/start" />}>Войти через Telegram</Button>;
}
