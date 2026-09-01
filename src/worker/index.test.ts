import { describe, expect, it, vi } from "vitest";

import { handleRequest, isApiRequest } from "./index";

describe("frontend Worker routing", () => {
  it("keeps API requests out of the SPA asset fallback", async () => {
    const apiFetch = vi.fn(async () => new Response("api"));
    const assetFetch = vi.fn(async () => new Response("asset"));
    const response = await handleRequest(
      new Request("https://planner.example.workers.dev/api/notes"),
      {
        API: { fetch: apiFetch },
        ASSETS: { fetch: assetFetch },
      },
    );

    expect(await response.text()).toBe("api");
    expect(apiFetch).toHaveBeenCalledOnce();
    expect(assetFetch).not.toHaveBeenCalled();
  });

  it("sends browser navigation to static assets", () => {
    expect(isApiRequest(new Request("https://planner.example.workers.dev/today"))).toBe(false);
  });
});
