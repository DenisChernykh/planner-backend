import { useGetApiPlansMonth } from "@/shared/api";

export function usePlanQuery(month: string) {
  return useGetApiPlansMonth(
    { month },
    {
      query: {
        refetchOnMount: "always",
        refetchOnWindowFocus: "always",
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
      },
    },
  );
}
