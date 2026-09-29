import type { QueryClient } from "@tanstack/react-query";

import {
  type GetApiPlansMonth200,
  type GetApiPlansMonth200GoalsItem,
  getGetApiPlansMonthQueryKey,
} from "@/shared/api";

export function setFactInCache(
  queryClient: QueryClient,
  month: string,
  goalId: string,
  date: string,
  entry: GetApiPlansMonth200GoalsItem["entries"][number] | undefined,
) {
  queryClient.setQueryData<GetApiPlansMonth200>(
    getGetApiPlansMonthQueryKey({ month }),
    (current) => {
      if (!current) return current;
      return {
        ...current,
        goals: current.goals.map((goal) => {
          if (goal.id !== goalId) return goal;
          const entries = goal.entries.filter((item) => item.date !== date);
          if (entry) return { ...goal, entries: [...entries, entry] };
          return { ...goal, entries };
        }),
      };
    },
  );
}
