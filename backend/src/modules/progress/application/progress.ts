import { ApplicationError } from "../../../shared/application/application-error";
import type { PlanningOperations } from "../../planning/public-contracts";
import { calculateGoalBatch, calculateProgress, completeProgress } from "../domain/calculate";
import { intervalFor, previousInterval, shiftDate, validProgressDate } from "../domain/calendar";
import type { ProgressOverview, ProgressReportGoal, ProgressReportOverview } from "../domain/model";

export type ProgressSettings = { startsOn: string | null; revision: number };
export interface ProgressRepository {
  settings(ownerId: string): Promise<ProgressSettings>;
  save(ownerId: string, startsOn: string | null): Promise<ProgressSettings>;
}
export type ProgressQuery = {
  ownerId: string;
  period: "week" | "month";
  anchor: string;
  now: number;
  timeZone: string;
  today: string;
  goalId?: string;
  goalIds?: string[];
  goals?: string;
  startsOn?: string | null;
  includeHistory?: boolean;
};
export type ProgressCalculationInput = Parameters<typeof calculateProgress>[0];

export class ProgressUseCases {
  constructor(
    private readonly repository: ProgressRepository,
    private readonly planning: PlanningOperations,
  ) {}

  settings(ownerId: string) {
    return this.repository.settings(ownerId);
  }

  async saveSettings(ownerId: string, startsOn: string | null) {
    if (startsOn !== null && !validProgressDate(startsOn))
      throw new ApplicationError("INVALID_REQUEST", "Укажите существующую дату начала учёта.");
    return this.repository.save(ownerId, startsOn);
  }

  async overview(input: ProgressQuery): Promise<ProgressOverview> {
    return this.calculateOverview(await this.prepareOverview(input));
  }

  calculateOverview(input: ProgressCalculationInput): ProgressOverview {
    return calculateProgress(input);
  }

  calculateReportBatch(input: ProgressCalculationInput, offset: number, limit: number) {
    const batch = calculateGoalBatch(input, offset, limit);
    const pending = new Set(batch.pendingChains);
    return {
      ...batch,
      // Future groups still need all compatible/incompatible historical versions
      // of their chain. Completed chains keep definitions for stable offsets but
      // no longer carry unused fact arrays through every later CAS write.
      calculation: {
        ...input,
        sources: input.sources.map((goal) =>
          pending.has(goal.chainId) ? goal : { ...goal, entries: [] },
        ),
      },
      goals: batch.goals.map((goal): ProgressReportGoal => {
        const {
          id,
          goalIds,
          title,
          tracking,
          cadence,
          measurable,
          average,
          minimum,
          maximum,
          targets,
          sum,
          records,
          eligibleDays,
          missing,
          met,
        } = goal;
        return {
          id,
          goalIds,
          title,
          tracking,
          cadence,
          measurable,
          average,
          minimum,
          maximum,
          targets,
          sum,
          records,
          eligibleDays,
          missing,
          met,
          days: goal.days.map(({ date, state, value }) => ({ date, state, value })),
          comparison: goal.comparison ? { deltaPoints: goal.comparison.deltaPoints } : null,
        };
      }),
    };
  }

  completeOverview(
    input: ProgressCalculationInput,
    goals: ProgressReportGoal[],
  ): ProgressReportOverview {
    return completeProgress(input, goals);
  }

  async prepareOverview(input: ProgressQuery): Promise<ProgressCalculationInput> {
    if (!validProgressDate(input.anchor) || !["week", "month"].includes(input.period))
      throw new ApplicationError("INVALID_REQUEST", "Проверьте период и дату.");
    const requested = intervalFor(input.period, input.anchor);
    const previous = previousInterval(input.period, requested, input.today);
    const fromMonth = [
      intervalFor("week", previous?.from ?? requested.from).from,
      input.includeHistory === false ? requested.from : shiftDate(requested.from, -21),
    ]
      .sort()[0]
      ?.slice(0, 7) as string;
    const toMonth = intervalFor("week", requested.to).to.slice(0, 7);
    let sources = await this.planning.progressSources(
      input.ownerId,
      fromMonth,
      toMonth,
      input.goalIds,
    );
    const knownSources = sources.map(({ chainId, month }) => ({ chainId, month }));
    if (input.goals) {
      const selected = input.goals.split(",");
      if (selected.some((id) => !sources.some((goal) => goal.id === id)))
        throw new ApplicationError("NOT_FOUND", "Цель удалена или недоступна.");
      const chains = new Set(
        sources.filter((goal) => selected.includes(goal.id)).map((goal) => goal.chainId),
      );
      sources = sources.filter((goal) => chains.has(goal.chainId));
    }
    if (input.goalIds !== undefined) {
      const ids = new Set(input.goalIds);
      // Selections are explicit monthly versions; never infer by title.
      sources = sources.filter((goal) => ids.has(goal.id));
    }
    if (input.goalId !== undefined) {
      const owned = await this.planning.goal(input.ownerId, input.goalId);
      if (!owned) throw new ApplicationError("NOT_FOUND", "Цель удалена или недоступна.");
      const selected =
        sources.find((goal) => goal.id === owned.id) ??
        (await this.planning.progressSources(input.ownerId, owned.month, owned.month)).find(
          (goal) => goal.id === owned.id,
        );
      if (!selected) throw new ApplicationError("NOT_FOUND", "Цель удалена или недоступна.");
      sources = sources.filter((goal) => goal.chainId === selected.chainId);
    }
    return {
      sources,
      knownSources,
      period: input.period,
      anchor: input.anchor,
      today: input.today,
      startsOn:
        input.startsOn === undefined
          ? (await this.settings(input.ownerId)).startsOn
          : input.startsOn,
      asOf: input.now,
      timeZone: input.timeZone,
      includeHistory: input.includeHistory,
    };
  }
}
