import type { PlanningRepository } from "../ports/planning-repository";
export class FindGoalQuery {
  constructor(private readonly repository: PlanningRepository) {}
  execute({ ownerId, goalId }: { ownerId: string; goalId: string }) {
    return this.repository.findOwnedActiveGoal(goalId, ownerId);
  }
}
