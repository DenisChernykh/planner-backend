import type { ReminderJob, ReminderSettings } from "../../domain/model";
import type { ReminderRepository } from "../ports/reminder-repository";
import type { ReminderTransport } from "../ports/reminder-transport";
import type { FindMissingGoalsQuery } from "./find-missing-goals.query";
import type { OutgoingMessage } from "./outgoing-message";

export class DigestMessages {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly transport: ReminderTransport | null,
    private readonly missing: FindMissingGoalsQuery,
  ) {}
  async build(job: ReminderJob, settings: ReminderSettings): Promise<OutgoingMessage | null> {
    const goals = await this.missing.execute({
      ownerId: job.ownerId,
      date: job.localDate,
      settings,
    });
    if (!goals.length) return null;
    const ids = JSON.parse(job.payload) as string[];
    for (const goal of goals) if (!ids.includes(goal.id)) ids.push(goal.id);
    const visible = goals.slice(0, 30);
    await this.repository.updateJob(job.id, { payload: JSON.stringify(ids) });
    return {
      text: `Осталось заполнить · ${job.localDate}\nВыберите цель.${goals.length > 30 ? " После заполнения появятся следующие." : ""}`,
      buttons: visible.map((goal) => [
        { text: goal.title.slice(0, 60), data: `pick:${job.id}:${ids.indexOf(goal.id)}` },
      ]),
    };
  }
  async refresh(job: ReminderJob, settings: ReminderSettings): Promise<void> {
    const data = JSON.parse(job.payload) as { digestId?: string };
    if (!data.digestId || !this.transport) return;
    const parent = await this.repository.job(data.digestId);
    if (!parent?.chatId || parent.messageId === null) return;
    const message = (await this.build(parent, settings)) ?? {
      text: `Всё заполнено · ${parent.localDate}`,
    };
    try {
      await this.transport.edit(parent.chatId, parent.messageId, message);
    } catch {
      /* A deleted Telegram message must not roll back a saved entry. */
    }
  }
}
