import type { SettingsInput } from "../../domain/model";
import { nextOccurrence, validateSettings } from "../../domain/schedule";
import type { ReminderRepository } from "../ports/reminder-repository";
import type { ProgressReportsUseCases } from "../reports/progress-reports";

export class SaveReminderSettingsUseCase {
  constructor(
    private readonly repository: ReminderRepository,
    private readonly reports?: ProgressReportsUseCases,
  ) {}

  async execute({ ownerId, input, now }: { ownerId: string; input: SettingsInput; now: number }) {
    validateSettings(input);
    const previous = await this.repository.settings(ownerId);
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
    if (
      previous.timeZone !== input.timeZone ||
      previous.quietStart !== input.quietStart ||
      previous.quietEnd !== input.quietEnd
    )
      await this.reports?.reschedule(ownerId, now, input);
    return settings;
  }
}
