import type { PlanningRepository } from "../ports/planning-repository";

export class ProgressSourcesQuery {
  constructor(private readonly repository: PlanningRepository) {}

  execute(ownerId: string, fromMonth: string, toMonth: string, entryGoalIds?: string[]) {
    return this.repository.progressSources(ownerId, fromMonth, toMonth, entryGoalIds);
  }
}
