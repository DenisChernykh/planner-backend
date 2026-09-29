import { GoalOrderMismatchError } from "../../domain/errors";
import type { GoalOrderCadence } from "../../domain/model";
import { validateGoalOrder } from "../../domain/rules";
import type { PlanningRepository } from "../ports/planning-repository";

export class ReorderGoalsUseCase {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(input: {
    ownerId: string;
    month: string;
    cadence: GoalOrderCadence;
    goalIds: string[];
  }): Promise<void> {
    validateGoalOrder(input.month, input.cadence, input.goalIds);
    if (
      !(await this.repository.reorderGoals(
        input.ownerId,
        input.month,
        input.cadence,
        input.goalIds,
      ))
    ) {
      throw new GoalOrderMismatchError();
    }
  }
}
