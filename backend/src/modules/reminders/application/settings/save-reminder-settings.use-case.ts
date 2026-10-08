import { ApplicationError } from "../../../../shared/application/application-error";
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
    for (let attempt = 0; attempt < 3; attempt++) {
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
      if (!(await this.repository.saveSettings(settings, reminders, previous))) continue;
      if (
        previous.timeZone !== input.timeZone ||
        previous.quietStart !== input.quietStart ||
        previous.quietEnd !== input.quietEnd
      )
        await this.reports?.reschedule(ownerId, now, input);
      return settings;
    }
    throw new ApplicationError(
      "CONFLICT",
      "Расписание изменилось. Обновите настройки и повторите сохранение.",
    );
  }
}
