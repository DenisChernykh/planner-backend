import { type GoalRecord, PlanningError } from "../../../planning";
import type { PlanningOperations } from "../../../planning/public-contracts";
import type { ReminderJob, ReminderSettings } from "../../domain/model";
import type { DigestMessages } from "../delivery/digest-messages";
import type { OutgoingMessage } from "../delivery/outgoing-message";
import type { ReminderRepository } from "../ports/reminder-repository";
import { conflictMessage } from "./conflict-message";
import { parseAnswer } from "./parse-answer";

export class RecordReminderAnswerUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly planning: PlanningOperations,
    private readonly digest: DigestMessages,
  ) {}

  async execute({
    job,
    goal,
    settings,
    raw,
    updateId,
    now,
  }: {
    job: ReminderJob;
    goal: GoalRecord;
    settings: ReminderSettings;
    raw: string;
    updateId: number;
    now: number;
  }): Promise<OutgoingMessage> {
    const parsed = parseAnswer(goal.tracking, raw);
    if ("error" in parsed) return { text: parsed.error };
    const { value } = parsed;
    let result: "saved" | "conflict";
    try {
      result = await this.planning.recordAnswer({
        ownerId: job.ownerId,
        goalId: goal.id,
        date: job.localDate,
        value,
        expectedRevision: job.expectedRevision,
        operationId: `telegram:${updateId}`,
        now,
        timeZone: settings.timeZone,
      });
    } catch (error) {
      if (error instanceof PlanningError)
        return {
          text: "Цель, дата или допустимые значения изменились. Проверьте запись в Planner; ответ не сохранён.",
        };
      throw error;
    }
    if (result === "conflict") return conflictMessage(job);
    await this.repository.updateJob(job.id, { status: "answered" });
    await this.digest.refresh(job, settings);
    return {
      text: `Записал: ${job.localDate}, ${goal.title} — ${"completed" in value ? (value.completed ? "да" : "нет") : value.value}.`,
      buttons: [[{ text: "Исправить", data: `edit:${job.id}` }]],
    };
  }
}
