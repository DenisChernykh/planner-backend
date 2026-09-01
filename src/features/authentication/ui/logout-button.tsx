import { Button } from "@/shared/ui";

import { useLogout } from "../model/use-logout";

/** Renders logout only for an enabled Telegram auth session. */
export function LogoutButton() {
  const logout = useLogout();

  return (
    <Button
      variant="outline"
      isLoading={logout.isPending}
      loadingLabel="Выходим"
      onClick={() => logout.mutate()}
    >
      Выйти
    </Button>
  );
}
