import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { vi } from "vitest";

const physicalFuture = Date.now() + 86_400_000;

// Keep the production-shaped DO binding while replacing only this test
// instance's environment. Tokens are hardcoded fake fixtures, never credentials.
export async function configureReminderScheduler(
  bindings: CloudflareBindings,
  name = "reminders",
  manualAlarms = false,
) {
  const stub = env.REMINDER_SCHEDULER.getByName(name);
  await runInDurableObject(stub, (instance, state) => {
    Reflect.set(instance, "env", bindings);
    if (!manualAlarms) return;
    // Workerd's automatic alarm clock is physical, independent of Vitest's
    // historical fixture clock. Prevent auto-firing; the test helper explicitly
    // runs each alarm while the application clock and fake transport are active.
    const set = state.storage.setAlarm.bind(state.storage);
    vi.spyOn(state.storage, "setAlarm").mockImplementation((at, options) =>
      set(Math.max(at instanceof Date ? at.getTime() : at, physicalFuture), options),
    );
  });
  return stub;
}
