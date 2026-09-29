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
): PutApiGoalsGoalIdEntriesDateBody {
  const cleanNote = note.trim();
  if (goal.tracking.type === "check") {
    if (cleanNote) return { completed: value === "true", note: cleanNote };
    return { completed: value === "true" };
  }
  if (goal.tracking.type === "time") {
    if (cleanNote) return { value, note: cleanNote };
    return { value };
  }
  const numericValue = Number(value);
  if (cleanNote) return { value: numericValue, note: cleanNote };
  return { value: numericValue };
}
