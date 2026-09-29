import { GoalNotFoundError } from "../../domain/errors";
import type { PlanningRepository } from "../ports/planning-repository";

export class DeleteGoalUseCase {
  constructor(private readonly repository: PlanningRepository) {}

  async execute({
    ownerId,
    goalId,
    now,
  }: {
    ownerId: string;
    goalId: string;
    now: number;
  }): Promise<void> {
    if (!(await this.repository.softDeleteOwnedGoal(goalId, ownerId, now))) {
      throw new GoalNotFoundError();
    }
  }
}
