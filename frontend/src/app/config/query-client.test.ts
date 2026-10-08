import { describe, expect, it } from "vitest";
import { currentSessionQueryKey } from "@/entities/session";
import { createPlannerQueryClient } from "./query-client";

const user = { id: "owner-a", displayName: "A", username: null, photoUrl: null };
const unauthenticated = Object.assign(new Error("expired"), {
  isAxiosError: true,
  response: { status: 401, data: { code: "UNAUTHENTICATED" } },
});

describe("personal cache isolation", () => {
  it("revokes cached identity on a personal query's 401 and cancels pending responses", async () => {
    const client = createPlannerQueryClient();
    await client.fetchQuery({
      queryKey: currentSessionQueryKey(),
      queryFn: async () => ({ user }),
    });
    client.setQueryData(["/api/plans/2026-10"], { private: true });
    let pendingSignal: AbortSignal | undefined;
    let resolve: ((value: string) => void) | undefined;
    const pending = client
      .fetchQuery({
        queryKey: ["/api/reminders/settings"],
        queryFn: ({ signal }) => {
          pendingSignal = signal;
          return new Promise<string>((finish) => {
            resolve = finish;
          });
        },
      })
      .catch(() => undefined);
    await client
      .fetchQuery({
        queryKey: ["/api/progress"],
        queryFn: async () => {
          throw unauthenticated;
        },
      })
      .catch(() => undefined);
    expect(client.getQueryData(currentSessionQueryKey())).toBeNull();
    expect(client.getQueryData(["/api/plans/2026-10"])).toBeUndefined();
    expect(pendingSignal?.aborted).toBe(true);
    resolve?.("late private response");
    await pending;
    expect(client.getQueryData(["/api/reminders/settings"])).toBeUndefined();
    client.clear();
  });
  it("preserves cached identity on network failure and clears personal data on account change", async () => {
    const client = createPlannerQueryClient();
    await client.fetchQuery({
      queryKey: currentSessionQueryKey(),
      queryFn: async () => ({ user }),
    });
    client.setQueryData(["/api/plans/2026-10"], { private: true });
    await client
      .fetchQuery({
        queryKey: ["/api/progress"],
        queryFn: async () => {
          throw new Error("offline");
        },
      })
      .catch(() => undefined);
    expect(client.getQueryData(currentSessionQueryKey())).toEqual({ user });
    expect(client.getQueryData(["/api/plans/2026-10"])).toEqual({ private: true });
    await client.fetchQuery({
      queryKey: currentSessionQueryKey(),
      queryFn: async () => ({ user: { ...user, id: "owner-b" } }),
    });
    expect(client.getQueryData(["/api/plans/2026-10"])).toBeUndefined();
    client.clear();
  });
});
