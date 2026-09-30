import type { RouteObject } from "react-router";
import { createBrowserRouter, Navigate, Outlet, useParams } from "react-router";

import { AuthenticationDisabledPage } from "@/pages/authentication-disabled";
import { CreateGoalPage } from "@/pages/create-goal";
import { LoginPage } from "@/pages/login";
import { NotFoundPage } from "@/pages/not-found";
import { PlanPage } from "@/pages/plan";
import { RemindersPage } from "@/pages/reminders";
import { TrashPage } from "@/pages/trash";
import { useGetApiRemindersSettings } from "@/shared/api";
import { getCurrentPlannerMonth, isPlannerMonth } from "@/shared/lib/planner-month";
import { Button } from "@/shared/ui";

import { MonthRollover } from "./month-rollover";
import { SessionGate } from "./session-gate";

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
    <>
      <MonthRollover month={month} />
      <Outlet />
    </>
  );
}

export const routes = [
  { path: "/login", element: <LoginPage /> },
  { path: "/authentication-disabled", element: <AuthenticationDisabledPage /> },
  {
    element: <SessionGate />,
    children: [
      { path: "/", element: <CurrentMonthRedirect /> },
      {
        path: "/plans/:month",
        element: <PlannerMonthRoute />,
        children: [
          { index: true, element: <PlanPage /> },
          { path: "goals/new", element: <CreateGoalPage /> },
          { path: "reminders", element: <RemindersPage /> },
          { path: "trash", element: <TrashPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
] satisfies RouteObject[];

export const router = createBrowserRouter(routes);
