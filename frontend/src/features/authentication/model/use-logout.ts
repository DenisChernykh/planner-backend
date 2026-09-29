import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { clearCurrentSession } from "@/entities/session";
import { postApiAuthLogout } from "@/shared/api";

/** Ends the Telegram session and clears the previous principal cache. */
export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => postApiAuthLogout(),
    onSuccess: () => {
      clearCurrentSession(queryClient);
      navigate("/login", { replace: true });
    },
  });
}
