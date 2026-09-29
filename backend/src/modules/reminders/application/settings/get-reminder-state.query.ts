import type { ReminderRepository } from "../ports/reminder-repository";

export class GetReminderStateQuery {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly botAvailable: boolean,
  ) {}

  async execute({ ownerId }: { ownerId: string }) {
    const settings = await this.repository.settings(ownerId);
    const link = await this.repository.link(ownerId);
    return {
      settings,
      connection: link?.status ?? "disconnected",
      botAvailable: this.botAvailable,
      deliveryIssues: await this.repository.deliveryIssues(ownerId),
    };
  }
}
