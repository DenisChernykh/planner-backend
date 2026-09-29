import { createApp, runReminders } from "./app/create-app";

export { createApp } from "./app/create-app";

const app = createApp();
export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: CloudflareBindings): Promise<void> {
    try {
      await runReminders(env, Date.now());
    } catch {
      console.error(JSON.stringify({ event: "reminder_tick_failed" }));
      throw new Error("Reminder tick failed");
    }
  },
};
