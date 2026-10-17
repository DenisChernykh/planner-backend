import { createPlanningMaintenance } from "../modules/planning";
import { createReminderMaintenance, createReminderRunner } from "../modules/reminders";
import { createReminderTransport } from "../modules/telegram-bot";

export async function runReminderMaintenance(env: CloudflareBindings, now: number) {
  await createPlanningMaintenance(env.DB).execute(now);
  await createReminderMaintenance(env.DB).execute(now);
}

export async function runReminders(env: CloudflareBindings, now: number): Promise<boolean> {
  if (env.TELEGRAM_BOT_MODE === "disabled") return false;
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (env.TELEGRAM_BOT_MODE !== "webhook" || !token)
    throw new Error("Invalid reminder transport configuration");
  return createReminderRunner(env.DB, createReminderTransport(token), env.APP_ORIGIN).execute({
    now,
    clock: Date.now,
  });
}
