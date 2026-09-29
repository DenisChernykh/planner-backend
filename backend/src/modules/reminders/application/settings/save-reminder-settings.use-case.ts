import type { SettingsInput } from "../../domain/model";
import { nextOccurrence, validateSettings } from "../../domain/schedule";
import type { ReminderRepository } from "../ports/reminder-repository";

export class SaveReminderSettingsUseCase {
  constructor(private readonly repository: ReminderRepository) {}

  async execute({ ownerId, input, now }: { ownerId: string; input: SettingsInput; now: number }) {
    validateSettings(input);
    const settings = {
      ...input,
      ownerId,
      nextEveningAt: nextOccurrence(now, input.timeZone, input.eveningTime),
    };
    const reminders = (await this.repository.reminders(ownerId)).map((item) => ({
      ...item,
      nextRunAt:
        item.mode === "scheduled"
          ? nextOccurrence(now, input.timeZone, item.time, item.weekdays)
          : null,
    }));
    await this.repository.saveSettings(settings, reminders);
    return settings;
  }
}
