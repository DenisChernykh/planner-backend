import { ArrowRight, CalendarDays, CheckCircle2, ChevronRight, Target, Trash2 } from "lucide-react";
import type { Ref } from "react";
import type { SearchResult } from "@/shared/api";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui";
import {
  formatSearchDate,
  matchSnippet,
  normalizeHighlight,
  resultValue,
  searchGoalMeta,
} from "../model/search-presentation";

export function SearchHighlight({ text, query }: { text: string; query: string }) {
  const terms = normalizeHighlight(query).trim().split(/\s+/u).filter(Boolean);
  if (!terms.length) return <>{text}</>;
  const normal = normalizeHighlight(text);
  const ranges: { start: number; end: number }[] = [];
  for (const term of terms) {
    let start = normal.indexOf(term);
    while (start >= 0) {
      ranges.push({ start, end: start + term.length });
      start = normal.indexOf(term, start + term.length);
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && previous.end >= range.start) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  let position = 0;
  const parts = merged.map((range) => {
    const before = text.slice(position, range.start);
    position = range.end;
    return (
      <span key={range.start}>
        {before}
        <mark className="rounded-sm bg-primary-soft text-foreground">
          {text.slice(range.start, range.end)}
        </mark>
      </span>
    );
  });
  return (
    <>
      {parts}
      {text.slice(position)}
    </>
  );
}

export function SearchResultRow({
  result,
  query,
  selected,
  onSelect,
  id,
}: {
  result: SearchResult;
  query: string;
  selected: boolean;
  onSelect: () => void;
  id: string;
}) {
  const Icon =
    result.goal.deletedAt !== null ? Trash2 : result.kind === "goal" ? Target : CalendarDays;
  const note =
    result.entry?.note ??
    (result.kind === "goal" || result.match === "description" ? result.goal.description : null);
  const hasValue = result.entry && typeof result.entry.value !== "boolean";
  const compact = hasValue && !note?.trim();
  const status = result.entry ? (result.entry.met ? "Выполнено" : "Не выполнено") : "Нет записи";
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onClick={onSelect}
      data-search-result
      className={cn(
        "flex w-full min-w-0 items-start gap-3 border-b px-0 py-5 text-left outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-ring md:rounded-lg md:px-4",
        compact && "py-3",
        selected && "md:bg-primary-soft",
      )}
    >
      <span className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-secondary md:flex">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <strong className="block break-words text-base font-semibold">
          <SearchHighlight text={result.goal.title} query={query} />
        </strong>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            {result.date
              ? formatSearchDate(result.date)
              : `${formatPlannerMonth(result.goal.month)} · ${searchGoalMeta(result.goal)}`}
          </span>
          {result.kind === "entry" && !compact && (
            <span className="inline-flex items-center gap-1">
              {result.entry?.met && (
                <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
              )}
              {status}
            </span>
          )}
          {result.goal.deletedAt !== null && (
            <span className="inline-flex items-center gap-1">
              <Trash2 className="size-3" aria-hidden="true" />
              Удалено
            </span>
          )}
        </span>
        {hasValue && !compact && (
          <span className="block text-sm font-medium">{resultValue(result)}</span>
        )}
        {note?.trim() && (
          <span className="block break-words text-sm leading-relaxed">
            <SearchHighlight text={matchSnippet(note, query)} query={query} />
          </span>
        )}
      </span>
      {compact && (
        <span className="shrink-0 space-y-1.5 text-right">
          <strong className="block text-base font-semibold">{resultValue(result)}</strong>
          <span
            className={cn(
              "block text-xs text-muted-foreground",
              result.entry?.met && "text-success",
            )}
          >
            {status}
          </span>
        </span>
      )}
      <ChevronRight
        aria-hidden="true"
        className={cn("mt-1 size-4 shrink-0 text-muted-foreground", !compact && "md:hidden")}
      />
    </button>
  );
}

export function SearchPreview({
  result,
  query,
  onOpen,
  titleRef,
}: {
  result: SearchResult;
  query: string;
  onOpen: () => void;
  titleRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <section aria-label="Предпросмотр результата" className="flex h-full min-h-0 flex-col gap-6">
      <div className="space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground">
          {result.kind === "goal" ? "ЦЕЛЬ" : "ЗАПИСЬ ЗА ДЕНЬ"}
        </p>
        <h2
          ref={titleRef}
          tabIndex={-1}
          className="break-words text-2xl font-semibold outline-none"
        >
          <SearchHighlight text={result.goal.title} query={query} />
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {searchGoalMeta(result.goal)}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto border-t pt-6">
        <p className="flex items-center gap-2.5 text-sm">
          <CalendarDays className="size-4" aria-hidden="true" />
          {result.date ? formatSearchDate(result.date) : formatPlannerMonth(result.goal.month)}
        </p>
        {result.kind === "entry" && (
          <div className="space-y-2">
            {result.entry && typeof result.entry.value !== "boolean" && (
              <p className="text-xl font-semibold">{resultValue(result)}</p>
            )}
            <p
              className={cn(
                "flex items-center gap-2 text-sm",
                result.entry?.met ? "text-success" : "text-muted-foreground",
              )}
            >
              {result.entry?.met && <CheckCircle2 className="size-4" aria-hidden="true" />}
              {!result.entry
                ? "За этот день ещё нет записи"
                : result.entry.met
                  ? "Выполнено"
                  : "Не выполнено"}
            </p>
          </div>
        )}
        {result.goal.deletedAt !== null && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Trash2 className="size-4" aria-hidden="true" />
            Цель удалена. Она доступна в корзине.
          </p>
        )}
        {(result.kind === "goal" || result.match === "description") && result.goal.description && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Описание</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              <SearchHighlight text={result.goal.description} query={query} />
            </p>
          </div>
        )}
        {result.kind === "entry" && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Заметка</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {result.entry?.note?.trim() ? (
                <SearchHighlight text={result.entry.note} query={query} />
              ) : (
                <span className="text-muted-foreground">Заметки нет</span>
              )}
            </p>
          </div>
        )}
      </div>
      <Button onClick={onOpen} className="h-11 self-end rounded-lg px-4 text-sm">
        {result.goal.deletedAt !== null ? "Открыть в корзине" : "Открыть в плане"}
        <ArrowRight className="ml-2 size-4" />
      </Button>
    </section>
  );
}
