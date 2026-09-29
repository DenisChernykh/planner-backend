export class ReminderSettingsInvalidError extends Error {
  constructor() {
    super("Проверьте часовой пояс и время.");
    this.name = "ReminderSettingsInvalidError";
  }
}

export class GoalReminderInvalidError extends Error {
  constructor() {
    super("Выберите время и дни недели.");
    this.name = "GoalReminderInvalidError";
  }
}

export class ReminderScheduleInvalidError extends Error {
  constructor() {
    super("Не удалось рассчитать расписание.");
    this.name = "ReminderScheduleInvalidError";
  }
}
