import type { GetApiPlansMonth200GoalsItem, PutApiGoalsGoalIdEntriesDateBody } from "@/shared/api";

export function initialFactValue(goal: GetApiPlansMonth200GoalsItem, date: string): string {
  const entry = goal.entries.find((item) => item.date === date);
  if (!entry) {
    if (goal.tracking.type === "check") return "false";
    return "";
  }
  if (goal.tracking.type === "check") {
    if (entry.value === true) return "true";
    return "false";
  }
  return String(entry.value);
}

export function buildFactPayload(
  goal: GetApiPlansMonth200GoalsItem,
  value: string,
  note: string,
  expectedRevision: string | null = null,
): PutApiGoalsGoalIdEntriesDateBody {
  const cleanNote = note;
  if (goal.tracking.type === "check") {
    if (cleanNote) return { completed: value === "true", note: cleanNote, expectedRevision };
    return { completed: value === "true", expectedRevision };
  }
  if (goal.tracking.type === "time") {
    if (cleanNote) return { value, note: cleanNote, expectedRevision };
    return { value, expectedRevision };
  }
  const numericValue = Number(value);
  if (cleanNote) return { value: numericValue, note: cleanNote, expectedRevision };
  return { value: numericValue, expectedRevision };
}
