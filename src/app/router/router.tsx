import type { RouteObject } from "react-router";
import { createBrowserRouter, Navigate, Outlet, useParams } from "react-router";

import { AuthenticationDisabledPage } from "@/pages/authentication-disabled";
import { CreateGoalPage } from "@/pages/create-goal";
import { LoginPage } from "@/pages/login";
import { NotFoundPage } from "@/pages/not-found";
import { PlanPage } from "@/pages/plan";
import { TrashPage } from "@/pages/trash";
import { getCurrentPlannerMonth, isPlannerMonth } from "@/shared/lib/planner-month";

import { SessionGate } from "./session-gate";

function CurrentMonthRedirect() {
  return <Navigate to={`/plans/${getCurrentPlannerMonth()}`} replace />;
}

function PlannerMonthRoute() {
  const month = useParams().month;
  if (!isPlannerMonth(month)) return <NotFoundPage invalidMonth={month ?? ""} />;
  return <Outlet />;
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
          { path: "trash", element: <TrashPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
] satisfies RouteObject[];

export const router = createBrowserRouter(routes);
