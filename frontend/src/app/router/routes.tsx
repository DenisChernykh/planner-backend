import type { RouteObject } from "react-router";
import { Navigate, Outlet, useParams } from "react-router";
import { PlannerSearchProvider } from "@/features/search";
import { AuthenticationDisabledPage } from "@/pages/authentication-disabled";
import { NotFoundPage } from "@/pages/not-found";
import { useGetApiRemindersSettings } from "@/shared/api";
import { getCurrentPlannerMonth, isPlannerMonth } from "@/shared/lib/planner-month";
import { Button } from "@/shared/ui";

import { MonthRollover } from "./month-rollover";
import { SessionGate } from "./session-gate";

function RouteLoading() {
  return (
    <main className="p-6" role="status">
      Загружаем страницу…
    </main>
  );
}

function CurrentMonthRedirect() {
  const settings = useGetApiRemindersSettings({ query: { refetchOnMount: "always" } });
  if (settings.isPending || settings.isFetching)
    return (
      <p role="status" className="p-6">
        Загружаем план…
      </p>
    );
  if (settings.isError || !settings.data)
    return (
      <div className="space-y-3 p-6">
        <p role="alert">Не удалось загрузить часовой пояс.</p>
        <Button onClick={() => settings.refetch()}>Повторить</Button>
      </div>
    );
  return (
    <Navigate
      to={`/plans/${getCurrentPlannerMonth(new Date(), settings.data.settings.timeZone)}`}
      replace
    />
  );
}

function PlannerMonthRoute() {
  const month = useParams().month;
  if (!isPlannerMonth(month)) return <NotFoundPage invalidMonth={month ?? ""} />;
  return (
    <PlannerSearchProvider month={month}>
      <MonthRollover month={month} />
      <Outlet />
    </PlannerSearchProvider>
  );
}

export const routes = [
  {
    path: "/login",
    HydrateFallback: RouteLoading,
    lazy: async () => ({ Component: (await import("@/pages/login")).LoginPage }),
  },
  { path: "/authentication-disabled", element: <AuthenticationDisabledPage /> },
  {
    element: <SessionGate />,
    HydrateFallback: RouteLoading,
    children: [
      { path: "/", element: <CurrentMonthRedirect /> },
      {
        path: "/plans/:month",
        element: <PlannerMonthRoute />,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import("@/pages/plan")).PlanPage }),
          },
          {
            path: "goals/new",
            lazy: async () => ({ Component: (await import("@/pages/create-goal")).CreateGoalPage }),
          },
          {
            path: "reminders",
            lazy: async () => ({ Component: (await import("@/pages/reminders")).RemindersPage }),
          },
          {
            path: "progress",
            lazy: async () => ({ Component: (await import("@/pages/progress")).ProgressPage }),
          },
          {
            path: "connections",
            lazy: async () => ({
              Component: (await import("@/pages/connections")).ConnectionsPage,
            }),
          },
          {
            path: "trash",
            lazy: async () => ({ Component: (await import("@/pages/trash")).TrashPage }),
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
] satisfies RouteObject[];
