import { GoalCadenceInvalidError } from "../../domain/errors";
import type { GoalResource } from "../../domain/model";
import { validMonth } from "../../domain/rules";
import type { PlanningRepository } from "../ports/planning-repository";
import { withEntries } from "./with-entries";

export class ListPlanQuery {
  constructor(private readonly repository: PlanningRepository) {}

  async execute({
    ownerId,
    month,
    date,
  }: {
    ownerId: string;
    month: string;
    date?: string;
  }): Promise<GoalResource[]> {
    if (!validMonth(month)) throw new GoalCadenceInvalidError();
    return withEntries(
      this.repository,
      ownerId,
      month,
      false,
      await this.repository.listGoals(ownerId, month, false),
      date,
    );
  }
}
