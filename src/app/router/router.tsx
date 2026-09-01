import { createBrowserRouter } from "react-router";

import { AuthenticationDisabledPage } from "@/pages/authentication-disabled";
import { HomePage } from "@/pages/home";
import { LoginPage } from "@/pages/login";

import { SessionGate } from "./session-gate";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/authentication-disabled", element: <AuthenticationDisabledPage /> },
  {
    element: <SessionGate />,
    children: [{ path: "/", element: <HomePage /> }],
  },
]);
