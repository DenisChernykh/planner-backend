import { env } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { createPlanningOperations } from "../src/modules/planning";
import { CreateGoal, UpsertGoalEntry } from "../src/modules/planning/application/use-cases";
import { D1PlanningRepository } from "../src/modules/planning/infrastructure/d1-planning-repository";
import { DEFAULT_SETTINGS } from "../src/modules/reminders/application/model";
import { ReminderService } from "../src/modules/reminders/application/service";
import { nextOccurrence } from "../src/modules/reminders/application/schedule";
import { D1ReminderRepository } from "../src/modules/reminders/infrastructure/d1-reminder-repository";

it("review evidence: a stale website note edit overwrites a newer Telegram value", async () => {
  const ownerId = crypto.randomUUID();
  const now = Date.parse("2026-09-29T12:00:00Z");
  await env.DB.prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)")
    .bind(ownerId, now, now).run();
  const repository = new D1PlanningRepository(env.DB);
  const planning = createPlanningOperations(env.DB);
  const goal = await new CreateGoal(repository).execute({
    ownerId, now, month: "2026-09", title: "Wake up", tracking: { type: "time" }, cadence: { period: "day" },
  });
  const input = { ownerId, now, goalId: goal.id, date: "2026-09-29" };
  await new UpsertGoalEntry(repository).execute({ ...input, value: { value: "07:00" } });
  const browserSnapshot = await planning.entry(ownerId, goal.id, input.date);
  expect(await planning.recordAnswer({
    ...input, now: now + 1, expectedRevision: browserSnapshot!.revision,
    operationId: crypto.randomUUID(), timeZone: "Asia/Yekaterinburg", value: { value: "07:40" },
  })).toBe("saved");
  await new UpsertGoalEntry(repository).execute({
    ...input, now: now + 2, value: { value: String(browserSnapshot!.entry.value), note: "New note" },
  });
  expect((await planning.entry(ownerId, goal.id, input.date))!.entry.value).toBe("07:00");
});

it("review evidence: both retention queries scan the history tables", async () => {
  for (const table of ["reminder_jobs", "planning_entry_commands"]) {
    const result = await env.DB.prepare(`EXPLAIN QUERY PLAN SELECT id FROM ${table} WHERE created_at < ? LIMIT 25`)
      .bind(0).all<{ detail: string }>();
    const details = result.results.map((row) => row.detail);
    console.log(JSON.stringify({ reviewTable: table, details }));
    expect(details).toContain(`SCAN ${table}`);
  }
});

it("review evidence: concurrent settings and goal edits leave nextRunAt inconsistent with the rule", async () => {
  const ownerId = crypto.randomUUID();
  const now = Date.parse("2026-09-29T03:00:00Z");
  await env.DB.prepare("INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)")
    .bind(ownerId, now, now).run();
  const repository = new D1ReminderRepository(env.DB);
  const planning = createPlanningOperations(env.DB);
  const service = new ReminderService(repository, planning, null, { random: () => "unused", hash: async (value) => value });
  const goal = await new CreateGoal(new D1PlanningRepository(env.DB)).execute({
    ownerId, now, month: "2026-09", title: "Goal", tracking: { type: "check" }, cadence: { period: "day" },
  });
  await service.saveSettings(ownerId, DEFAULT_SETTINGS, now);
  const rule = { mode: "scheduled" as const, time: "09:00", weekdays: [1, 2, 3, 4, 5, 6, 7] };
  await service.saveGoal(ownerId, goal.id, rule, now);
  const commit = repository.saveSettings.bind(repository);
  const spy = vi.spyOn(repository, "saveSettings").mockImplementationOnce(async (settings, reminders) => {
    await service.saveGoal(ownerId, goal.id, { ...rule, time: "11:00" }, now);
    await commit(settings, reminders);
  });
  await service.saveSettings(ownerId, { ...DEFAULT_SETTINGS, timeZone: "UTC" }, now);
  spy.mockRestore();
  const saved = (await repository.reminders(ownerId))[0]!;
  expect(saved.time).toBe("11:00");
  expect(saved.nextRunAt).toBe(nextOccurrence(now, "UTC", "09:00"));
  expect(saved.nextRunAt).not.toBe(nextOccurrence(now, "UTC", saved.time));
});
