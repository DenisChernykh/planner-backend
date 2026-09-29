import type { PlanningOperations } from "../../../planning/public-contracts";
import { canAnswerJob, snoozedUntil } from "../../domain/jobs";
import type { FindMissingGoalsQuery } from "../delivery/find-missing-goals.query";
import type { OpenReminderQuestionUseCase } from "../delivery/open-reminder-question.use-case";
import type { OutgoingMessage } from "../delivery/outgoing-message";
import type { ReminderRepository } from "../ports/reminder-repository";
import { makeJob } from "../scheduling/make-job";
import { conflictMessage } from "./conflict-message";
import type { RecordReminderAnswerUseCase } from "./record-reminder-answer.use-case";

export class HandleReminderReplyUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly planning: PlanningOperations,
    private readonly missing: FindMissingGoalsQuery,
    private readonly openQuestion: OpenReminderQuestionUseCase,
    private readonly recordAnswer: RecordReminderAnswerUseCase,
  ) {}

  async execute({
    ownerId,
    chatId,
    jobId,
    replyToMessageId,
    action,
    value,
    updateId,
    now,
  }: {
    ownerId: string;
    chatId: string;
    jobId?: string;
    replyToMessageId?: number;
    action?: string;
    value?: string;
    updateId: number;
    now: number;
  }): Promise<OutgoingMessage> {
    const job = jobId
      ? await this.repository.job(jobId)
      : replyToMessageId !== undefined
        ? await this.repository.replyJob(chatId, replyToMessageId)
        : null;
    if (!canAnswerJob(job, ownerId, chatId, now))
      return {
        text: "Ответьте на конкретный вопрос бота. Старые или отключённые вопросы больше недоступны.",
      };
    const settings = await this.repository.settings(ownerId);
    if (action === "pick" && job.kind === "digest") {
      const ids = JSON.parse(job.payload) as string[];
      const index = Number(value);
      const goalId = Number.isInteger(index) ? ids[index] : undefined;
      const missing = await this.missing.execute({
        ownerId: job.ownerId,
        date: job.localDate,
        settings,
      });
      if (!goalId || !missing.some((goal) => goal.id === goalId))
        return { text: "Эта цель уже заполнена или больше недоступна." };
      const child = makeJob(
        job.ownerId,
        goalId,
        job.localDate,
        "question",
        `pick:${updateId}`,
        now,
      );
      child.payload = JSON.stringify({ digestId: job.id });
      return this.openQuestion.execute({ child, now });
    }
    if (!job.goalId) return { text: "Выберите цель кнопкой под вечерним сообщением." };
    const goal = await this.planning.goal(job.ownerId, job.goalId);
    if (!goal) return { text: "Цель удалена. Запись не изменена." };
    if (action === "input" || action === "edit") {
      const existing = await this.planning.entry(job.ownerId, goal.id, job.localDate);
      if (existing && action !== "edit") return conflictMessage(job);
      const child = makeJob(
        job.ownerId,
        goal.id,
        job.localDate,
        action === "edit" ? "correction" : "input",
        `input:${updateId}`,
        now,
      );
      child.expectedRevision = existing?.revision ?? null;
      child.payload = job.payload;
      return this.openQuestion.execute({ child, now });
    }
    if (action === "snooze") {
      if (await this.planning.entry(job.ownerId, goal.id, job.localDate))
        return conflictMessage(job);
      const child = makeJob(
        job.ownerId,
        goal.id,
        job.localDate,
        "question",
        `snooze:${updateId}`,
        now,
        snoozedUntil(now, settings),
      );
      child.payload = job.payload;
      await this.repository.enqueue(child);
      return {
        text: `Напомню через 30 минут или после тихих часов. Дата записи: ${job.localDate}.`,
      };
    }
    if (job.status === "answered")
      return {
        text: "Ответ уже сохранён. Для замены используйте «Исправить».",
        buttons: [[{ text: "Исправить", data: `edit:${job.id}` }]],
      };
    if (action && action !== "value")
      return { text: "Неизвестная кнопка. Используйте кнопки под вопросом." };

    return this.recordAnswer.execute({
      job,
      goal,
      settings,
      raw: value?.trim() ?? "",
      updateId,
      now,
    });
  }
}
