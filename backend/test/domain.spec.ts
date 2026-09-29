import { describe, expect, it } from "vitest";
import { NotePatchEmptyError } from "../src/modules/notes/domain/errors";
import { validateNoteChanges } from "../src/modules/notes/domain/rules";
import {
  EntryDateFutureError,
  EntryDateInvalidError,
  GoalCadenceInvalidError,
  GoalTypeImmutableError,
} from "../src/modules/planning/domain/errors";
import type { GoalRecord } from "../src/modules/planning/domain/model";
import {
  validateAnswerDate,
  validateEntryDate,
  validateGoalChanges,
  validateGoalCreation,
} from "../src/modules/planning/domain/rules";
import {
  canAnswerJob,
  canAskGoal,
  createReminderJob,
  deliveryDecision,
  failedDeliveryChanges,
  isRecentOccurrence,
} from "../src/modules/reminders/domain/jobs";
import { DEFAULT_SETTINGS, type ReminderSettings } from "../src/modules/reminders/domain/model";

const now = Date.parse("2026-09-29T19:00:00Z"); // Midnight in Yekaterinburg.
const day = 86_400_000;
const settings: ReminderSettings = {
  ...DEFAULT_SETTINGS,
  ownerId: "owner",
  enabled: true,
  nextEveningAt: null,
};
const link = { ownerId: "owner", chatId: "chat", telegramUserId: "user", status: "active" };
const job = createReminderJob({
  id: "job",
  ownerId: "owner",
  goalId: "goal",
  date: "2026-09-29",
  kind: "question",
  eventKey: "scheduled:goal:2026-09-29",
  now,
});

describe("planning domain", () => {
  it.each([validateEntryDate, validateAnswerDate])(
    "uses the supplied timezone and rejects nonexistent dates before persistence (%#)",
    (validate) => {
      expect(() => validate("2026-09-30", "2026-09", now, "Asia/Yekaterinburg")).not.toThrow();
      expect(() => validate("2026-09-30", "2026-09", now, "America/Los_Angeles")).toThrow(
        EntryDateFutureError,
      );
      expect(() => validate("2026-02-29", "2026-02", now, "UTC")).toThrow(EntryDateInvalidError);
      expect(() => validate("2024-02-29", "2024-02", now, "UTC")).not.toThrow();
      expect(() => validate("2026-09-29", "2026-08", now, "UTC")).toThrow(EntryDateInvalidError);
    },
  );

  it("normalizes a goal and bounds monthly cadence by the actual month", () => {
    const input = {
      title: "  Read  ",
      tracking: { type: "check" as const },
      cadence: { period: "month" as const, targetOccurrences: 29 },
    };
    expect(validateGoalCreation(input, "2024-02")).toMatchObject({
      title: "Read",
      description: null,
    });
    expect(() => validateGoalCreation(input, "2026-02")).toThrow(GoalCadenceInvalidError);
    expect(input.title).toBe("  Read  ");
  });

  it("preserves tracking type and does not mutate the goal while validating a patch", () => {
    const goal: GoalRecord = {
      id: "goal",
      ownerId: "owner",
      month: "2026-09",
      title: "Read",
      description: "Description",
      tracking: { type: "check" },
      cadence: { period: "day" },
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    expect(validateGoalChanges(goal, { title: "  Updated  ", description: null })).toEqual({
      title: "Updated",
      description: null,
    });
    expect(() =>
      validateGoalChanges(goal, { tracking: { type: "scale", min: 1, max: 5 } }),
    ).toThrow(GoalTypeImmutableError);
    expect(goal.title).toBe("Read");
  });
});

describe("reminder domain", () => {
  it("postpones scheduled delivery at night, while an explicit question bypasses quiet hours and pause", () => {
    expect(deliveryDecision(job, settings, link, now, false)).toEqual({
      action: "postpone",
      dueAt: Date.parse("2026-09-30T03:00:00Z"),
    });
    expect(deliveryDecision(job, { ...settings, enabled: false }, link, now, false)).toEqual({
      action: "cancel",
    });
    expect(deliveryDecision(job, { ...settings, enabled: false }, link, now, true)).toEqual({
      action: "send",
      chatId: "chat",
    });
    expect(deliveryDecision(job, settings, { ...link, status: "blocked" }, now, true)).toEqual({
      action: "cancel",
    });
    expect(deliveryDecision(job, settings, null, now, true)).toEqual({ action: "cancel" });
    expect(deliveryDecision(job, settings, link, job.expiresAt, true)).toEqual({
      action: "cancel",
    });
  });

  it("allows correction of an existing entry, but never asks about another month", () => {
    expect(canAskGoal(job, "2026-09", true, undefined, true)).toBe(false);
    expect(canAskGoal({ ...job, kind: "correction" }, "2026-09", true, undefined, true)).toBe(true);
    expect(canAskGoal({ ...job, kind: "correction" }, "2026-10", true, undefined, true)).toBe(
      false,
    );
  });

  it("limits retries, respects a provider delay and never retries an ambiguous delivery", () => {
    expect(failedDeliveryChanges({ ...job, attempts: 3 }, "retry", 120, now)).toEqual({
      status: "pending",
      dueAt: now + 120_000,
      leaseUntil: null,
    });
    expect(failedDeliveryChanges({ ...job, attempts: 4 }, "retry", 1, now)).toEqual({
      status: "failed",
      dueAt: now + 60_000,
      leaseUntil: null,
    });
    expect(failedDeliveryChanges(job, "unknown", 60, now).status).toBe("unknown");
    expect(failedDeliveryChanges(job, "blocked", 60, now).status).toBe("failed");
  });

  it("keeps the seven-day answer window separate from the one-day delivery window", () => {
    const sent = { ...job, status: "sent" as const, chatId: "chat" };
    expect(isRecentOccurrence(now, now + day - 1)).toBe(true);
    expect(isRecentOccurrence(now, now + day)).toBe(false);
    expect(canAnswerJob(sent, "owner", "chat", now + 7 * day)).toBe(true);
    expect(canAnswerJob(sent, "owner", "chat", now + 7 * day + 1)).toBe(false);
    expect(canAnswerJob(sent, "someone-else", "chat", now)).toBe(false);
    expect(canAnswerJob(sent, "owner", "another-chat", now)).toBe(false);
    expect(canAnswerJob({ ...sent, status: "cancelled" }, "owner", "chat", now)).toBe(false);
  });
});

describe("notes domain", () => {
  it("distinguishes clearing a body from an empty patch and leaves its input unchanged", () => {
    const input = { title: "  Title  ", body: "" };
    expect(validateNoteChanges(input)).toEqual({ title: "Title", body: "" });
    expect(input.title).toBe("  Title  ");
    expect(() => validateNoteChanges({})).toThrow(NotePatchEmptyError);
  });
});
