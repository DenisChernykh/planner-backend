import type { ReminderJob, ReminderSettings } from "../../domain/model";
import type { ReminderRepository } from "../ports/reminder-repository";
import type { ReminderTransport } from "../ports/reminder-transport";
import type { FindMissingGoalsQuery } from "./find-missing-goals.query";
import { formatDigest } from "./format-digest";
import type { OutgoingMessage } from "./outgoing-message";

export class DigestMessages {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly transport: ReminderTransport | null,
    private readonly missing: Pick<FindMissingGoalsQuery, "execute">,
  ) {}
  async prepareDelivery(
    job: ReminderJob,
    settings: ReminderSettings,
  ): Promise<OutgoingMessage | null> {
    const goals = await this.missing.execute({
      ownerId: job.ownerId,
      date: job.localDate,
      settings,
    });
    if (!goals.length) return null;
    const { ids, message } = formatDigest({
      jobId: job.id,
      date: job.localDate,
      previousIds: JSON.parse(job.payload) as string[],
      goals,
    });
    await this.repository.updateJob(job.id, { payload: JSON.stringify(ids) });
    return message;
  }
  async refreshAfterAnswer(job: ReminderJob, settings: ReminderSettings): Promise<void> {
    const data = JSON.parse(job.payload) as { digestId?: string };
    if (!data.digestId || !this.transport) return;
    const parent = await this.repository.job(data.digestId);
    if (!parent?.chatId || parent.messageId === null) return;
    const message = (await this.prepareDelivery(parent, settings)) ?? {
      text: `Всё заполнено · ${parent.localDate}`,
    };
    try {
      await this.transport.edit(parent.chatId, parent.messageId, message);
    } catch {
      /* A deleted Telegram message must not roll back a saved entry. */
    }
  }
}
