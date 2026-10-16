import { createPlanningMaintenance } from "../modules/planning";
import { createReminderMaintenance, createReminderRunner } from "../modules/reminders";
import { createReminderTransport } from "../modules/telegram-bot";

const runners = new WeakMap<CloudflareBindings, ReturnType<typeof createReminderRunner>>();

export async function runReminders(env: CloudflareBindings, now: number): Promise<void> {
  // Retention gets its own tick, so the hourly cleanup cannot consume a send's
  // CPU budget. Due work remains persisted and resumes on the following minute.
  if (Math.floor(now / 60_000) % 60 === 0) {
    await createPlanningMaintenance(env.DB).execute(now);
    await createReminderMaintenance(env.DB).execute(now);
    return;
  }
  let runner = runners.get(env);
  if (!runner) {
    // Cron has no HTTP/OIDC inputs. Validate only the transport it actually uses;
    // HTTP handlers continue to validate the full runtime configuration.
    let transport = null;
    if (env.TELEGRAM_BOT_MODE === "webhook") {
      const token = env.TELEGRAM_BOT_TOKEN?.trim();
      if (!token) throw new Error("Missing reminder transport configuration");
      transport = createReminderTransport(token);
    } else if (env.TELEGRAM_BOT_MODE !== "disabled") {
      throw new Error("Invalid reminder transport mode");
    }
    runner = createReminderRunner(env.DB, transport, env.APP_ORIGIN);
    runners.set(env, runner);
  }
  // Cache wiring only. Eligibility and claims are read from D1 on each tick.
  await runner.execute({ now, deferNewReportSnapshot: true, deferNewDelivery: true });
}
