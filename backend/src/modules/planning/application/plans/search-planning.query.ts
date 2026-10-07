import { ApplicationError } from "../../../../shared/application/application-error";
import { plannerToday } from "../../domain/rules";
import {
  hasEntryFilters,
  type SearchFilters,
  searchGoal,
  searchPlanning,
  searchValue,
} from "../../domain/search";
import type { SearchRepository } from "../ports/search-repository";

export class SearchPlanningQuery {
  constructor(private readonly repository: SearchRepository) {}

  async goals(ownerId: string, includeDeleted: boolean) {
    return (await this.repository.searchGoals(ownerId, { includeDeleted })).map(searchGoal);
  }

  async execute(input: { ownerId: string; filters: SearchFilters; now: number; timeZone: string }) {
    const { ownerId, filters } = input;
    const [goals, entries] = await Promise.all([
      this.repository.searchGoals(ownerId, filters),
      filters.kind === "goals" && !hasEntryFilters(filters)
        ? []
        : this.repository.searchEntries(ownerId, filters),
    ]);
    if (filters.comparison) {
      const selected = goals.find((goal) => goal.id === filters.goalId);
      if (selected) {
        const time = selected.tracking.type === "time";
        const value = searchValue(filters.value ?? "", time);
        const upper = searchValue(filters.valueTo ?? "", time);
        if (
          selected.tracking.type === "check" ||
          value === null ||
          (filters.comparison === "between" && (upper === null || upper < value))
        ) {
          throw new ApplicationError(
            "INVALID_REQUEST",
            "The value filter does not match the selected goal.",
          );
        }
      }
    }
    return searchPlanning(goals, entries, filters, plannerToday(input.now, input.timeZone));
  }
}
