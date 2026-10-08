import { env } from "cloudflare:workers";
import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it, vi } from "vitest";
import type { IdentityContextVariables } from "../src/modules/identity-access/public-contracts";
import { NoteNotFoundError } from "../src/modules/notes/domain/errors";
import {
  createNotesHttp,
  type NotesHttpDependencies,
} from "../src/modules/notes/presentation/http";
import type { GoalRecord, PlanningOperations } from "../src/modules/planning/public-contracts";
import { HandleReminderReplyUseCase } from "../src/modules/reminders/application/answers/handle-reminder-reply.use-case";
import { parseAnswer } from "../src/modules/reminders/application/answers/parse-answer";
import { formatDigest } from "../src/modules/reminders/application/delivery/format-digest";
import { makeJob } from "../src/modules/reminders/application/scheduling/make-job";
import { D1ReminderRepository } from "../src/modules/reminders/infrastructure/d1-reminder-repository";
import type { WorkerHttpEnv } from "../src/platform/http/environment";

const ownerId = "7f5690b6-3446-4c34-8e19-e5e6e780ea58";
const noteId = "d1d55c08-549c-468b-bb74-d6f540829cba";
const note = { id: noteId, ownerId, title: "Read", body: "Draft", createdAt: 1, updatedAt: 1 };

describe("structural application collaborators", () => {
  it("tests a Notes HTTP query with typed execute stubs and mapped failures", async () => {
    const getNote = { execute: vi.fn(async () => note) };
    const dependencies: NotesHttpDependencies = {
      createUseCases: () => ({
        getNote,
        listNotes: { execute: vi.fn(async () => [note]) },
        createNote: { execute: vi.fn(async () => note) },
        updateNote: { execute: vi.fn(async () => note) },
        deleteNote: { execute: vi.fn(async () => {}) },
      }),
    };
    const router = new OpenAPIHono<WorkerHttpEnv<IdentityContextVariables>>();
    router.use("*", async (c, next) => {
      c.set("authenticatedUser", {
        id: ownerId,
        displayName: "Test",
        username: null,
        photoUrl: null,
      });
      await next();
    });
    router.route("/", createNotesHttp(dependencies));
    const success = await router.request(`/api/notes/${noteId}`, undefined, env);
    expect(success.status).toBe(200);
    expect(await success.json()).toEqual({ note });
    expect(getNote.execute).toHaveBeenCalledWith({ ownerId, noteId });
    getNote.execute.mockRejectedValueOnce(new NoteNotFoundError());
    const missing = await router.request(`/api/notes/${noteId}`, undefined, env);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "NOTE_NOT_FOUND" });
  });
  it("dispatches a reply to typed fake use cases without constructing their dependency graph", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, created_at, updated_at) VALUES (?, 1, 1) ON CONFLICT DO NOTHING",
    )
      .bind(ownerId)
      .run();
    const repository = new D1ReminderRepository(env.DB);
    const now = Date.parse("2026-10-08T05:00:00Z");
    const job = {
      ...makeJob(ownerId, noteId, "2026-10-08", "input", "fake-reply", now),
      goalId: null,
      status: "sent" as const,
      chatId: "123",
      messageId: 1,
    };
    await repository.enqueue(job);
    // The job's goal reference is set after insertion to keep this fake goal out of persistence.
    vi.spyOn(repository, "job").mockResolvedValue({ ...job, goalId: noteId });
    const goal: GoalRecord = {
      id: noteId,
      ownerId,
      month: "2026-10",
      title: "Read",
      description: null,
      tracking: { type: "check" },
      cadence: { period: "day" },
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    };
    const planning: PlanningOperations = {
      progressSources: vi.fn(async () => []),
      ensureCurrentPlan: vi.fn(async () => ({ month: "2026-10", carriedGoals: [] })),
      list: vi.fn(async () => []),
      goal: vi.fn(async () => goal),
      entry: vi.fn(async () => null),
      recordAnswer: vi.fn(async () => "saved" as const),
    };
    const record = { execute: vi.fn(async () => ({ text: "saved" })) };
    const reply = new HandleReminderReplyUseCase(
      repository,
      planning,
      { execute: vi.fn(async () => []) },
      { execute: vi.fn(async () => ({ text: "question" })) },
      record,
    );
    const input = { ownerId, chatId: "123", jobId: job.id, value: "да", updateId: 1, now };
    expect(await reply.execute(input)).toEqual({ text: "saved" });
    expect(record.execute).toHaveBeenCalledOnce();
    const failure = new Error("storage unavailable");
    record.execute.mockRejectedValueOnce(failure);
    await expect(reply.execute({ ...input, updateId: 2 })).rejects.toBe(failure);
    vi.restoreAllMocks();
  });
});

describe("pure digest and scale policies", () => {
  it("keeps stable button indexes, a 30-goal limit and a pure empty result", () => {
    const goals = Array.from({ length: 32 }, (_, index) => ({
      id: String(index),
      title: `Goal ${index}`,
    }));
    const first = formatDigest({ jobId: "job", date: "2026-10-08", previousIds: [], goals });
    expect(first.message?.buttons).toHaveLength(30);
    const next = formatDigest({
      jobId: "job",
      date: "2026-10-08",
      previousIds: first.ids,
      goals: goals.slice(1),
    });
    expect(next.message?.buttons?.[0]?.[0]?.data).toBe("pick:job:1");
    expect(first.ids).toHaveLength(32);
    expect(
      formatDigest({ jobId: "job", date: "2026-10-08", previousIds: first.ids, goals: [] }).message,
    ).toBeNull();
  });
  it.each([1, 5])("accepts the scale boundary %s", (value) =>
    expect(parseAnswer({ type: "scale", min: 1, max: 5 }, String(value))).toEqual({
      value: { value },
    }),
  );
  it.each(["0", "6", "2.5"])("rejects %s with the current scale range", (value) =>
    expect(parseAnswer({ type: "scale", min: 1, max: 5 }, value)).toEqual({
      error: "Введите целое число от 1 до 5.",
    }),
  );
});
