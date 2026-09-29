import type { GoalCreateInput, GoalRecord } from "../../domain/model";
import { validateGoalCreation } from "../../domain/rules";
import type { PlanningRepository } from "../ports/planning-repository";

export class CreateGoalUseCase {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(
    input: GoalCreateInput & { month: string; now: number; ownerId: string },
  ): Promise<GoalRecord> {
    const definition = validateGoalCreation(input, input.month);
    return this.repository.createGoal({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      month: input.month,
      ...definition,
      deletedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
}
