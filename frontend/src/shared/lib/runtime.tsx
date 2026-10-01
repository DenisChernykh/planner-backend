import { createContext, useContext } from "react";

export const RuntimeContext = createContext<"web" | "chatgpt">("web");
export function useAppRuntime() {
  return useContext(RuntimeContext);
}

export const ExternalNavigationContext = createContext<((url: string) => Promise<void>) | null>(
  null,
);
export function useExternalNavigation() {
  return useContext(ExternalNavigationContext);
}
