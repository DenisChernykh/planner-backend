import type { GoalRecord } from "../../domain/model";
import type { SearchEntry, SearchFilters } from "../../domain/search";

export type SearchScope = Pick<
  SearchFilters,
  "from" | "to" | "tracking" | "cadence" | "goalId" | "includeDeleted"
>;

export interface SearchRepository {
  searchGoals(ownerId: string, scope: SearchScope): Promise<GoalRecord[]>;
  searchEntries(ownerId: string, scope: SearchScope): Promise<SearchEntry[]>;
}
