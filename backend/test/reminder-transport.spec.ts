import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryError } from "../src/modules/reminders/public-contracts";
import { createReminderTransport } from "../src/modules/telegram-bot/infrastructure/reminder-transport";

afterEach(() => vi.unstubAllGlobals());
const transport = () => createReminderTransport("123:fixture-token");

describe("reminder JSON transport", () => {
  it("sends HTML with URL and callback buttons in their original rows", async () => {
    const send = vi.fn(async () => Response.json({ ok: true, result: { message_id: 42 } }));
    vi.stubGlobal("fetch", send);
    expect(
      await transport().send("fixture-chat", {
        text: "fallback",
        html: "<b>Report</b>",
        buttons: [
          [{ text: "Open", url: "https://example.com" }],
          [
            { text: "Yes", data: "value:fixture:yes" },
            { text: "Later", data: "snooze:fixture" },
          ],
        ],
      }),
    ).toBe(42);
    expect(send).toHaveBeenCalledTimes(1);
    const [url, request] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith("/sendMessage")).toBe(true);
    expect(request.method).toBe("POST");
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(request.body))).toEqual({
      chat_id: "fixture-chat",
      text: "<b>Report</b>",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Open", url: "https://example.com" }],
          [
            { text: "Yes", callback_data: "value:fixture:yes" },
            { text: "Later", callback_data: "snooze:fixture" },
          ],
        ],
      },
    });
  });

  it("supports force replies, message edits that remove buttons and username lookup", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, request: RequestInit) => {
        bodies.push(JSON.parse(String(request.body)));
        return Response.json({
          ok: true,
          result: url.endsWith("/getMe") ? { username: "fixture_bot" } : { message_id: 1 },
        });
      }),
    );
    const api = transport();
    await api.send("fixture-chat", { text: "Input", forceReply: true });
    await api.edit("fixture-chat", 1, { text: "Saved" });
    expect(await api.username()).toBe("fixture_bot");
    expect(bodies).toEqual([
      {
        chat_id: "fixture-chat",
        text: "Input",
        reply_markup: { force_reply: true, selective: true },
      },
      {
        chat_id: "fixture-chat",
        message_id: 1,
        text: "Saved",
        reply_markup: { inline_keyboard: [] },
      },
      {},
    ]);
  });

  it.each([
    [403, undefined, "blocked", 60],
    [429, 120, "retry", 120],
    [429, undefined, "retry", 60],
    [400, undefined, "permanent", 60],
    [500, undefined, "unknown", 60],
  ] as const)(
    "classifies Telegram %s without automatic retries",
    async (code, retry, kind, delay) => {
      const send = vi.fn(async () =>
        Response.json(
          {
            ok: false,
            error_code: code,
            parameters: { retry_after: retry },
            description: "Untrusted error description",
          },
          { status: code },
        ),
      );
      vi.stubGlobal("fetch", send);
      await expect(transport().send("fixture-chat", { text: "Question" })).rejects.toMatchObject({
        kind,
        retryAfter: delay,
      });
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["disconnect", "invalid-json", "missing-result", "missing-id", "server-status"])(
    "keeps %s ambiguous and sanitizes transport details",
    async (failure) => {
      const send = vi.fn(async () => {
        if (failure === "disconnect") throw new Error("sensitive transport detail");
        if (failure === "invalid-json") return new Response("bad response", { status: 502 });
        if (failure === "missing-result") return Response.json({ ok: true });
        return Response.json(
          { ok: true, result: failure === "missing-id" ? {} : { message_id: 1 } },
          { status: failure === "server-status" ? 502 : 200 },
        );
      });
      vi.stubGlobal("fetch", send);
      const result = transport().send("fixture-chat", { text: "Question" });
      await expect(result).rejects.toBeInstanceOf(DeliveryError);
      await expect(result).rejects.toMatchObject({
        kind: "unknown",
        message: "Telegram delivery failed",
      });
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
});
