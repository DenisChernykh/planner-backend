import type { GoalPatchInput, GoalResource } from "../../domain/model";
import { requireGoal, validateGoalChanges } from "../../domain/rules";
import type { PlanningRepository } from "../ports/planning-repository";

export class UpdateGoalUseCase {
  constructor(private readonly repository: PlanningRepository) {}

  async execute(
    input: GoalPatchInput & { goalId: string; now: number; ownerId: string },
  ): Promise<GoalResource> {
    const goal = requireGoal(
      await this.repository.findOwnedActiveGoal(input.goalId, input.ownerId),
    );
    const changes = { updatedAt: input.now, ...validateGoalChanges(goal, input) };
    const updated = await this.repository.updateOwnedGoal(input.goalId, input.ownerId, changes);
    const saved = requireGoal(updated);
    return { ...saved, entries: await this.repository.listEntries(saved.id) };
  }
}
