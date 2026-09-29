import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { useConsumedFragmentParameter } from "./use-consumed-fragment-parameter";

function TokenProbe() {
  const token = useConsumedFragmentParameter("token");
  return <output data-testid="token">{token ?? "none"}</output>;
}

describe("useConsumedFragmentParameter", () => {
  it("consumes the parameter and removes the fragment from router history", async () => {
    const router = createMemoryRouter([{ path: "/auth/verify-email", element: <TokenProbe /> }], {
      initialEntries: ["/auth/verify-email#token=abc_123"],
    });

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId("token")).toHaveTextContent("abc_123");
    await router.initialize();
    expect(router.state.location.hash).toBe("");
  });

  it("returns null without navigating when the parameter is missing", () => {
    const router = createMemoryRouter([{ path: "/auth/verify-email", element: <TokenProbe /> }], {
      initialEntries: ["/auth/verify-email"],
    });

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId("token")).toHaveTextContent("none");
    expect(router.state.location.pathname).toBe("/auth/verify-email");
    expect(router.state.location.hash).toBe("");
  });

  it("replaces the consumed value when the same route receives a new fragment", async () => {
    const router = createMemoryRouter([{ path: "/auth/verify-email", element: <TokenProbe /> }], {
      initialEntries: ["/auth/verify-email#token=first_token"],
    });

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId("token")).toHaveTextContent("first_token");
    await router.navigate("/auth/verify-email#token=second_token");

    await waitFor(() => {
      expect(screen.getByTestId("token")).toHaveTextContent("second_token");
      expect(router.state.location.hash).toBe("");
    });
  });
});
