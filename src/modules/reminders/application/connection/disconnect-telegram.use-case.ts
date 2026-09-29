import type { ReminderRepository } from "../ports/reminder-repository";

export class DisconnectTelegramUseCase {
  constructor(private readonly repository: ReminderRepository) {}

  execute({ ownerId }: { ownerId: string }) {
    return this.repository.disconnect(ownerId);
  }
}
