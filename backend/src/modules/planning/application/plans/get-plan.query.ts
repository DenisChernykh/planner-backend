import type { GoalResource } from "../../domain/model";
import { plannerToday } from "../../domain/rules";
import type { ListPlanQuery } from "./list-plan.query";

export class GetPlanQuery {
  constructor(private readonly listPlan: ListPlanQuery) {}

  async execute(input: {
    ownerId: string;
    month: string;
    now: number;
    timeZone: string;
  }): Promise<{ month: string; today: string; goals: GoalResource[] }> {
    const goals = await this.listPlan.execute({ ownerId: input.ownerId, month: input.month });
    return {
      month: input.month,
      today: plannerToday(input.now, input.timeZone),
      goals,
    };
  }
}
