import { createContext, useContext } from "react";

export const RuntimeContext = createContext<"web" | "chatgpt">("web");
export function useAppRuntime() {
  return useContext(RuntimeContext);
}
