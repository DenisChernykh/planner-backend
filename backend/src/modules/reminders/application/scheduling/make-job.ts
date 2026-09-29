import { createReminderJob } from "../../domain/jobs";
import type { ReminderJob } from "../../domain/model";

export function makeJob(
  ownerId: string,
  goalId: string | null,
  date: string,
  kind: ReminderJob["kind"],
  eventKey: string,
  now: number,
  dueAt = now,
): ReminderJob {
  return createReminderJob({
    id: crypto.randomUUID(),
    ownerId,
    goalId,
    date,
    kind,
    eventKey,
    now,
    dueAt,
  });
}
