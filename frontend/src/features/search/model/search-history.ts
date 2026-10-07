import { z } from "zod";
import { type SearchForm, searchFormSchema } from "./search-form";

const historySchema = z.array(searchFormSchema).max(8);
export function historyKey(ownerId: string) {
  return `planner.search.v1.${ownerId}`;
}
export function readSearchHistory(ownerId: string): SearchForm[] {
  try {
    return historySchema.parse(JSON.parse(localStorage.getItem(historyKey(ownerId)) ?? "[]"));
  } catch {
    return [];
  }
}
export function writeSearchHistory(ownerId: string, entries: SearchForm[]) {
  try {
    localStorage.setItem(historyKey(ownerId), JSON.stringify(entries));
  } catch {
    /* Search remains usable when browser storage is unavailable. */
  }
}
export function rememberSearch(history: SearchForm[], form: SearchForm): SearchForm[] {
  const completed = { ...form, q: form.q.trim() };
  if (!completed.q) return history;
  const key = JSON.stringify(completed);
  return [completed, ...history.filter((entry) => JSON.stringify(entry) !== key)].slice(0, 8);
}
