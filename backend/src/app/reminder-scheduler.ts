import { DurableObject } from "cloudflare:workers";
import { runReminderMaintenance, runReminders } from "./run-reminders";

const MINUTE = 60_000;

export class ReminderScheduler extends DurableObject<CloudflareBindings> {
  private running = false;

  async wake(): Promise<void> {
    // Cron is a recovery/bootstrap heartbeat. Never postpone an existing alarm
    // or create another run while the current alarm is still doing network I/O.
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.running) return;
      if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now());
    });
  }

  override async alarm(): Promise<void> {
    if (this.env.TELEGRAM_BOT_MODE !== "webhook") return;
    this.running = true;
    try {
      const now = Date.now();
      // Persist recovery before any D1 or external I/O. Cron can also restore a
      // missing alarm after an outage. The platform serializes alarm handlers.
      await this.ctx.storage.setAlarm(now + MINUTE);
      const hour = Math.floor(now / 3_600_000);
      if ((await this.ctx.storage.get<number>("maintenanceHour")) !== hour) {
        await runReminderMaintenance(this.env, now);
        await this.ctx.storage.put("maintenanceHour", hour);
      }
      const more = await runReminders(this.env, Date.now());
      if (more) await this.ctx.storage.setAlarm(Date.now() + 1000);
    } catch {
      // Durable fallback survives transient failures and exhausted platform
      // retries. Never print upstream error details or access-bearing URLs.
      console.error(JSON.stringify({ event: "reminder_alarm_failed" }));
      await this.ctx.storage.setAlarm(Date.now() + MINUTE);
      throw new Error("Reminder alarm failed");
    } finally {
      this.running = false;
    }
  }
}
