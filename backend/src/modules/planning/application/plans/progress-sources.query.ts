import type { PlanningRepository } from "../ports/planning-repository";

export class ProgressSourcesQuery {
  constructor(private readonly repository: PlanningRepository) {}

  execute(ownerId: string, fromMonth: string, toMonth: string) {
    return this.repository.progressSources(ownerId, fromMonth, toMonth);
  }
}
