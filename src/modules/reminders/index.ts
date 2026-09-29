import { randomBase64Url, sha256Base64Url } from "../../platform/crypto/secure-values";
import { createPlanningOperations } from "../planning";
import type { ReminderTransport } from "./application/ports";
import { ReminderService } from "./application/service";
import { D1ReminderRepository } from "./infrastructure/d1-reminder-repository";
import { createReminderHttp } from "./presentation/http";

export function createReminderService(database: D1Database, transport: ReminderTransport | null) {
  return new ReminderService(
    new D1ReminderRepository(database),
    createPlanningOperations(database),
    transport,
    { random: () => randomBase64Url(24), hash: sha256Base64Url },
  );
}
export async function reminderTimeZone(database: D1Database, ownerId: string): Promise<string> {
  return (await new D1ReminderRepository(database).settings(ownerId)).timeZone;
}
export function createRemindersModule(
  createTransport: (env: CloudflareBindings) => ReminderTransport | null,
) {
  return {
    router: createReminderHttp((env) => createReminderService(env.DB, createTransport(env))),
  };
}
