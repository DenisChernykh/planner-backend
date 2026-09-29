import type { ReminderJob } from "../../domain/model";
import type { ReminderRepository } from "../ports/reminder-repository";
import type { DeliverReminderUseCase } from "./deliver-reminder.use-case";
import type { OutgoingMessage } from "./outgoing-message";

export class OpenReminderQuestionUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly deliver: DeliverReminderUseCase,
  ) {}

  async execute({ child, now }: { child: ReminderJob; now: number }): Promise<OutgoingMessage> {
    const job = await this.repository.enqueue(child);
    await this.deliver.execute({ job, now, interactive: true });
    const status = (await this.repository.job(job.id))?.status;
    return {
      text:
        status === "sent" || status === "answered"
          ? ""
          : status === "pending"
            ? "Telegram временно ограничил отправку. Повторю вопрос позже."
            : "Не удалось подтвердить отправку вопроса. Попробуйте открыть его ещё раз.",
    };
  }
}
