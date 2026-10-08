import type { GoalRecord } from "../../domain/model";
import type { EntrySnapshot, RecordAnswerInput } from "../../public-contracts";
import type { EntryWrite } from "./planning-repository";
export interface AnswerRepository {
  findOwnedActiveGoal(goalId: string, ownerId: string): Promise<GoalRecord | null>;
  entrySnapshot(ownerId: string, goalId: string, date: string): Promise<EntrySnapshot | null>;
  recordAnswer(
    input: RecordAnswerInput,
    entry: EntryWrite,
    goalUpdatedAt: number,
    receiptLifetime?: "retry-window" | "goal",
  ): Promise<"saved" | "conflict">;
}
