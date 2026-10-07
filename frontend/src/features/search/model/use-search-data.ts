import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getApiSearch, getApiSearchGoals, type SearchGoal } from "@/shared/api";
import { hasSearch, type SearchForm, searchFormError, searchParameters } from "./search-form";

const noGoals: SearchGoal[] = [];
export function useSearchData(ownerId: string, form: SearchForm, open: boolean) {
  const [settled, setSettled] = useState(form);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(form), 250);
    return () => window.clearTimeout(timer);
  }, [form]);
  const catalogue = useQuery({
    queryKey: ["planner-search-goals", ownerId, form.includeDeleted],
    queryFn: ({ signal }) =>
      getApiSearchGoals(
        { includeDeleted: form.includeDeleted ? "true" : "false" },
        undefined,
        signal,
      ),
    enabled: open,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const goals = catalogue.data?.goals ?? noGoals;
  const error =
    catalogue.isPending && form.comparison !== "any" ? null : searchFormError(form, goals);
  const parameters = searchParameters(settled);
  const ready = hasSearch(form);
  const debouncing = settled !== form;
  const waitingForGoal = form.comparison !== "any" && catalogue.isPending;
  const results = useInfiniteQuery({
    queryKey: ["planner-search", ownerId, parameters],
    queryFn: ({ signal, pageParam }) =>
      getApiSearch({ ...parameters, offset: pageParam }, undefined, signal),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    enabled: open && ready && !error && !debouncing && !waitingForGoal,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return {
    catalogue,
    goals,
    error,
    ready,
    results,
    loading: debouncing || waitingForGoal || results.isPending,
  };
}
