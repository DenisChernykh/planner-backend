import { Button } from "@/shared/ui";

import { useLogout } from "../model/use-logout";

/** Renders logout only for an enabled Telegram auth session. */
export function LogoutButton({ className }: { className?: string }) {
  const logout = useLogout();

  return (
    <Button
      className={className}
      variant="outline"
      isLoading={logout.isPending}
      loadingLabel="Выходим"
      onClick={() => logout.mutate()}
    >
      Выйти
    </Button>
  );
}
