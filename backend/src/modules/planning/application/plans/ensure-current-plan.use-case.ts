import { carryGoalToMonth } from "../../domain/month-rollover";
import { daysInMonth, plannerToday } from "../../domain/rules";
import type { MonthRolloverRepository } from "../ports/month-rollover-repository";

export class EnsureCurrentPlanUseCase {
  constructor(private readonly repository: MonthRolloverRepository) {}

  async execute(input: {
    ownerId: string;
    now: number;
    timeZone: string;
    includeCarriedGoals?: boolean;
  }) {
    const month = plannerToday(input.now, input.timeZone).slice(0, 7);
    if (input.includeCarriedGoals === false) {
      await this.repository.copyCurrentMonth({
        ...input,
        month,
        operationId: crypto.randomUUID(),
        monthlyLimit: daysInMonth(month),
      });
      return { month, carriedGoals: [] };
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const state = await this.repository.rolloverState(input.ownerId, month);
      if (
        state.initialized ||
        (await this.repository.commitRollover({
          ...input,
          month,
          sourceMonth: state.sourceMonth,
          operationId: crypto.randomUUID(),
          goals: state.goals.map(({ goal, revision }, sortOrder) => ({
            sourceGoalId: goal.id,
            revision,
            sortOrder,
            goal: carryGoalToMonth(goal, month, crypto.randomUUID(), input.now),
          })),
        }))
      ) {
        return {
          month,
          carriedGoals: await this.repository.carriedGoals(input.ownerId, month),
        };
      }
    }
    throw new Error("The previous plan changed during month rollover; retry the request.");
  }
}
