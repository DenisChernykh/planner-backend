import { createApp } from "./app/create-app";

export { createApp } from "./app/create-app";
export { ReminderScheduler } from "./app/reminder-scheduler";

let app: ReturnType<typeof createApp> | undefined;
export default {
  fetch(request: Request, env: CloudflareBindings, context: ExecutionContext) {
    // Cron isolates do not need to construct the HTTP router and OpenAPI registry.
    app ??= createApp();
    return app.fetch(request, env, context);
  },
  async scheduled(_controller: ScheduledController, env: CloudflareBindings): Promise<void> {
    try {
      if (env.TELEGRAM_BOT_MODE === "webhook")
        await env.REMINDER_SCHEDULER.getByName("reminders").wake();
    } catch {
      console.error(JSON.stringify({ event: "reminder_tick_failed" }));
      throw new Error("Reminder tick failed");
    }
  },
};
