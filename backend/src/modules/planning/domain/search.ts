import type { GoalEntry, GoalRecord } from "./model";
import { daysInMonth } from "./rules";

export type SearchFilters = {
  q: string;
  kind: "all" | "goals" | "entries";
  from?: string;
  to?: string;
  tracking?: GoalRecord["tracking"]["type"];
  cadence?: GoalRecord["cadence"]["period"];
  goalId?: string;
  presence: "any" | "present" | "missing";
  met: "any" | "met" | "unmet";
  note: "any" | "present" | "absent";
  comparison?: "gt" | "lt" | "eq" | "between";
  value?: string;
  valueTo?: string;
  includeDeleted: boolean;
  offset: number;
  limit: number;
};

export type SearchGoal = Pick<
  GoalRecord,
  "id" | "month" | "title" | "description" | "tracking" | "cadence" | "deletedAt"
>;
export type SearchEntry = GoalEntry & { goalId: string };
export type SearchResult = {
  id: string;
  kind: "goal" | "entry";
  goal: SearchGoal;
  date: string | null;
  entry: GoalEntry | null;
  match: "title" | "description" | "note" | null;
};
export type SearchPage = {
  results: SearchResult[];
  total: number;
  counts: { goals: number; entries: number };
  nextOffset: number | null;
  suggestion: string | null;
  today: string;
};

export function searchGoal(goal: GoalRecord): SearchGoal {
  const { id, month, title, description, tracking, cadence, deletedAt } = goal;
  return { id, month, title, description, tracking, cadence, deletedAt };
}

export function normalizeSearch(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/ё/gu, "е").trim().replace(/\s+/gu, " ");
}

export function hasEntryFilters(filters: SearchFilters): boolean {
  return (
    filters.presence !== "any" ||
    filters.met !== "any" ||
    filters.note !== "any" ||
    !!filters.comparison
  );
}

/** Time comparisons use minutes after midnight; a range includes both endpoints. */
export function searchValue(value: string, time: boolean): number | null {
  if (time) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)) return null;
    return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  }
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/u.test(value.trim())) return null;
  const number = Number(value.trim().replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function matchesValue(entry: GoalEntry, goal: SearchGoal, filters: SearchFilters): boolean {
  if (!filters.comparison) return true;
  if (typeof entry.value === "boolean") return false;
  const time = goal.tracking.type === "time";
  const value = typeof entry.value === "number" ? entry.value : searchValue(entry.value, time);
  const threshold = searchValue(filters.value ?? "", time);
  if (value === null || threshold === null) return false;
  switch (filters.comparison) {
    case "lt":
      return value < threshold;
    case "gt":
      return value > threshold;
    case "eq":
      return value === threshold;
    case "between": {
      const upper = searchValue(filters.valueTo ?? "", time);
      return upper !== null && value >= threshold && value <= upper;
    }
  }
}

function matchesTerms(value: string, terms: string[]): boolean {
  const text = normalizeSearch(value);
  return terms.every((term) => text.includes(term));
}

// Suggest only an explicit single-edit correction, never silently rewrite the query.
function oneEditAway(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0;
  while (a[i] === b[i] && i < Math.min(a.length, b.length)) i++;
  if (a.length === b.length) {
    return (
      a.slice(i + 1) === b.slice(i + 1) ||
      (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
    );
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function suggest(query: string, corpus: Iterable<string>): string | null {
  if (query.length < 4 || query.includes(" ")) return null;
  const words = new Map<string, number>();
  for (const text of corpus) {
    for (const word of normalizeSearch(text).match(/[\p{L}\p{N}]+/gu) ?? []) {
      if (oneEditAway(query, word)) words.set(word, (words.get(word) ?? 0) + 1);
    }
  }
  return [...words].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/** Ranking and missing-day semantics are independent of HTTP and persistence. */
export function searchPlanning(
  goals: GoalRecord[],
  entries: SearchEntry[],
  filters: SearchFilters,
  today: string,
): SearchPage {
  const query = normalizeSearch(filters.q);
  const terms = query ? query.split(" ") : [];
  const kind = hasEntryFilters(filters) ? "entries" : filters.kind;
  const candidates: { result: SearchResult; score: number; date: string }[] = [];
  const corpus: string[] = [];
  const entriesByGoal = new Map<string, SearchEntry[]>();
  for (const entry of entries) {
    const list = entriesByGoal.get(entry.goalId) ?? [];
    list.push(entry);
    entriesByGoal.set(entry.goalId, list);
  }
  for (const record of goals) {
    const goal = searchGoal(record);
    const titleMatches = matchesTerms(goal.title, terms);
    const goalMatches = matchesTerms(`${goal.title} ${goal.description ?? ""}`, terms);
    const goalMatch = query ? (titleMatches ? "title" : "description") : null;
    const goalScore = !query
      ? 0
      : normalizeSearch(goal.title) === query
        ? 400
        : titleMatches
          ? 300
          : 200;
    if (kind !== "entries") {
      corpus.push(goal.title, goal.description ?? "");
      if (goalMatches)
        candidates.push({
          result: {
            id: `goal:${goal.id}`,
            kind: "goal",
            goal,
            date: null,
            entry: null,
            match: goalMatch,
          },
          score: goalScore,
          date: `${goal.month}-31`,
        });
    }
    if (kind === "goals") continue;
    const goalEntries = entriesByGoal.get(goal.id) ?? [];
    if (filters.presence === "missing") {
      corpus.push(goal.title, goal.description ?? "");
      if (!goalMatches) continue;
      const recorded = new Set(goalEntries.map((entry) => entry.date));
      for (let day = 1; day <= daysInMonth(goal.month); day++) {
        const date = `${goal.month}-${String(day).padStart(2, "0")}`;
        if (
          date > today ||
          (filters.from && date < filters.from) ||
          (filters.to && date > filters.to) ||
          recorded.has(date)
        )
          continue;
        candidates.push({
          result: {
            id: `entry:${goal.id}:${date}`,
            kind: "entry",
            goal,
            date,
            entry: null,
            match: goalMatch,
          },
          score: goalScore,
          date,
        });
      }
      continue;
    }
    for (const entry of goalEntries) {
      if ((filters.from && entry.date < filters.from) || (filters.to && entry.date > filters.to))
        continue;
      if ((filters.met === "met" && !entry.met) || (filters.met === "unmet" && entry.met)) continue;
      const hasNote = !!entry.note?.trim();
      if ((filters.note === "present" && !hasNote) || (filters.note === "absent" && hasNote))
        continue;
      if (!matchesValue(entry, goal, filters)) continue;
      corpus.push(entry.note ?? "");
      if (!matchesTerms(entry.note ?? "", terms)) continue;
      const { goalId: _goalId, ...value } = entry;
      candidates.push({
        result: {
          id: `entry:${goal.id}:${entry.date}`,
          kind: "entry",
          goal,
          date: entry.date,
          entry: value,
          match: query ? "note" : null,
        },
        score: query ? 100 : 0,
        date: entry.date,
      });
    }
  }
  candidates.sort(
    (a, b) =>
      b.score - a.score || b.date.localeCompare(a.date) || a.result.id.localeCompare(b.result.id),
  );
  const counts = { goals: 0, entries: 0 };
  for (const { result } of candidates) counts[result.kind === "goal" ? "goals" : "entries"]++;
  const end = filters.offset + filters.limit;
  return {
    results: candidates.slice(filters.offset, end).map(({ result }) => result),
    total: candidates.length,
    counts,
    nextOffset: end < candidates.length ? end : null,
    suggestion: candidates.length === 0 ? suggest(query, corpus) : null,
    today,
  };
}
