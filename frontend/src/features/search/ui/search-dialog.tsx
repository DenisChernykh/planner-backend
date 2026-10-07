import { Dialog } from "@base-ui/react/dialog";
import { ArrowLeft, Search, SlidersHorizontal, X, XCircle } from "lucide-react";
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import type { SearchResult } from "@/shared/api";
import { useIsMobile } from "@/shared/lib/hooks";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui";
import {
  initialSearchForm,
  type SearchForm,
  searchChips,
  updateSearchForm,
} from "../model/search-form";
import { readSearchHistory, rememberSearch, writeSearchHistory } from "../model/search-history";
import { resultDestination } from "../model/search-presentation";
import { useSearchData } from "../model/use-search-data";
import { SearchDateRange, SearchFilters, SearchScope } from "./search-controls";
import { SearchPreview, SearchResultRow } from "./search-results";
import { SearchEmpty, SearchHistory, SearchLoading } from "./search-states";

export default function SearchDialog({
  ownerId,
  month,
  open,
  onOpenChange,
  returnFocus,
}: {
  ownerId: string;
  month: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const [form, setForm] = useState(initialSearchForm);
  const [history, setHistory] = useState(() => readSearchHistory(ownerId));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobilePage, setMobilePage] = useState<"results" | "preview" | "filters">("results");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const previewTitle = useRef<HTMLHeadingElement>(null);
  const filtersTitle = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const id = useId();
  const data = useSearchData(ownerId, form, open);
  const items = data.results.data?.pages.flatMap((page) => page.results) ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const page = data.results.data?.pages[0];
  const chips = searchChips(form, data.goals);
  const failed = data.results.isError && !data.results.data;
  const usable = data.ready && !data.loading && !data.error && !failed;
  const remember = () => {
    if (!usable) return;
    const next = rememberSearch(history, form);
    setHistory(next);
    writeSearchHistory(ownerId, next);
  };
  const close = () => {
    remember();
    setMobilePage("results");
    setFiltersOpen(false);
    onOpenChange(false);
  };
  const resetScroll = () => {
    savedScroll.current = 0;
    if (listRef.current) listRef.current.scrollTop = 0;
    setSelectedId(null);
  };
  const update = (patch: Partial<SearchForm>) => {
    const next = updateSearchForm(form, patch, data.goals);
    if (patch.presence === "missing")
      setAnnouncement("Выбраны дни без записи. Фильтры выполнения, заметки и значения сброшены.");
    else if (
      patch.kind &&
      patch.kind !== "entries" &&
      (form.presence !== "any" ||
        form.met !== "any" ||
        form.note !== "any" ||
        form.comparison !== "any")
    )
      setAnnouncement("Фильтры записей сброшены.");
    else setAnnouncement("");
    setForm(next);
    resetScroll();
  };
  const resetFilters = () => {
    setForm({ ...initialSearchForm, q: form.q });
    resetScroll();
    setAnnouncement("Фильтры сброшены.");
  };
  const openResult = (result: SearchResult) => {
    remember();
    setMobilePage("results");
    setFiltersOpen(false);
    onOpenChange(false);
    void navigate(resultDestination(result), { state: { fromSearch: true } });
  };
  const select = (result: SearchResult) => {
    setSelectedId(result.id);
    setFiltersOpen(false);
    if (isMobile) {
      popupRef.current?.focus({ preventScroll: true });
      setMobilePage("preview");
    }
  };
  const returnToResults = () => {
    // Keep focus on a mounted element while changing panes, before moving it to the result.
    popupRef.current?.focus({ preventScroll: true });
    setMobilePage("results");
    setFiltersOpen(false);
    requestAnimationFrame(() => {
      const target = isMobile
        ? listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
        : inputRef.current;
      (target ?? inputRef.current)?.focus({ preventScroll: true });
    });
  };
  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    listRef.current = node;
    if (node) node.scrollTop = savedScroll.current;
  }, []);
  const selectedKey = selected?.id;
  useEffect(() => {
    if (mobilePage === "preview" && selectedKey) previewTitle.current?.focus();
    if (mobilePage === "filters") filtersTitle.current?.focus();
  }, [mobilePage, selectedKey]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.nativeEvent.isComposing ||
      event.defaultPrevented ||
      !usable ||
      !selected ||
      mobilePage !== "results"
    )
      return;
    const target = event.target as HTMLElement;
    if (target !== inputRef.current && !target.closest("[data-search-result]")) return;
    if (event.key === "Enter") {
      event.preventDefault();
      openResult(selected);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index =
      selectedId === null
        ? event.key === "ArrowDown"
          ? -1
          : items.length
        : items.findIndex((item) => item.id === selected.id);
    const nextIndex = Math.max(
      0,
      Math.min(items.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)),
    );
    const next = items[nextIndex];
    if (next) {
      setSelectedId(next.id);
      document.getElementById(`${id}-result-${nextIndex}`)?.scrollIntoView?.({ block: "nearest" });
    }
  };
  const filterPanel = (
    <SearchFilters
      form={form}
      goals={data.goals}
      onChange={update}
      loading={data.catalogue.isPending}
      failed={data.catalogue.isError}
      onRetry={() => void data.catalogue.refetch()}
      error={data.error}
    />
  );
  const main = !(isMobile && mobilePage !== "results");

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next, details) => {
        if (!next && details.reason === "escape-key" && (mobilePage !== "results" || filtersOpen)) {
          details.cancel();
          returnToResults();
        } else if (!next) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/40" />
        <Dialog.Popup
          ref={popupRef}
          initialFocus={inputRef}
          finalFocus={returnFocus}
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-50 flex h-dvh w-full min-w-0 flex-col overflow-hidden bg-popover text-popover-foreground outline-none md:inset-auto md:top-1/2 md:left-1/2 md:h-[min(804px,calc(100dvh-4rem))] md:w-[calc(100vw-3rem)] md:max-w-[1000px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:border md:shadow-xl"
        >
          <Dialog.Title className="sr-only">Поиск по целям и записям</Dialog.Title>
          <Dialog.Description className="sr-only">
            Ищите по всем месяцам. Стрелки выбирают результат, Enter открывает его в плане. Escape
            закрывает поиск.
          </Dialog.Description>
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
          {isMobile && (
            <div className="flex min-h-19 shrink-0 items-center justify-between gap-2 px-5 pt-3 md:hidden">
              {mobilePage === "preview" ? (
                <Button
                  variant="ghost"
                  onClick={returnToResults}
                  className="h-11 rounded-lg px-0 text-sm"
                >
                  <ArrowLeft className="mr-2 size-5" />
                  Результаты
                </Button>
              ) : (
                <h2
                  ref={filtersTitle}
                  tabIndex={-1}
                  className="text-2xl font-semibold outline-none"
                >
                  {mobilePage === "filters" ? "Фильтры" : "Поиск"}
                </h2>
              )}
              <Button
                variant="ghost"
                aria-label={mobilePage === "results" ? "Закрыть поиск" : "К результатам"}
                onClick={() => (mobilePage === "results" ? close() : returnToResults())}
                className="size-11 rounded-lg"
              >
                <X className="size-6" />
              </Button>
            </div>
          )}
          {main && (
            <>
              <div className="flex shrink-0 items-center gap-3 px-5 pb-4 md:px-[22px] md:pt-5">
                <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-xl border border-input px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 md:h-14 md:px-4">
                  <Search className="size-5 shrink-0" aria-hidden="true" />
                  <input
                    ref={inputRef}
                    type="search"
                    role="combobox"
                    aria-label="Поиск по целям и заметкам"
                    aria-autocomplete="list"
                    aria-expanded={usable && items.length > 0}
                    aria-controls={usable && items.length > 0 ? `${id}-results` : undefined}
                    aria-activedescendant={
                      usable && selected
                        ? `${id}-result-${items.findIndex((item) => item.id === selected.id)}`
                        : undefined
                    }
                    value={form.q}
                    maxLength={160}
                    placeholder="Поиск по целям и заметкам"
                    onChange={(event) => update({ q: event.target.value })}
                    className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
                  />
                  {form.q && (
                    <Button
                      variant="ghost"
                      aria-label="Очистить запрос"
                      onClick={() => {
                        update({ q: "" });
                        inputRef.current?.focus();
                      }}
                      className="size-11 shrink-0 rounded-lg text-muted-foreground"
                    >
                      <XCircle className="size-5" />
                    </Button>
                  )}
                </div>
                {!isMobile && (
                  <Button
                    variant="ghost"
                    aria-label="Закрыть поиск"
                    onClick={close}
                    className="hidden h-14 w-10 flex-col gap-0.5 rounded-lg text-muted-foreground md:flex"
                  >
                    <X className="size-5" />
                    <span className="text-[10px]">Esc</span>
                  </Button>
                )}
              </div>
              <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b px-5 pb-4 md:grid-cols-[minmax(180px,240px)_minmax(220px,320px)_auto] md:justify-between md:px-[22px]">
                <SearchScope form={form} month={month} onChange={update} />
                <fieldset
                  className="col-span-2 row-start-2 grid h-11 grid-cols-3 rounded-lg bg-secondary p-1 md:col-span-1 md:col-start-2 md:row-start-1 md:h-10"
                  aria-label="Тип результатов"
                >
                  {(
                    [
                      ["all", "Всё"],
                      ["goals", "Цели"],
                      ["entries", "Записи"],
                    ] as const
                  ).map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={form.kind === kind}
                      onClick={() => update({ kind })}
                      className={cn(
                        "rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        form.kind === kind
                          ? "bg-primary-soft font-medium text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </fieldset>
                <Button
                  variant="outline"
                  aria-expanded={filtersOpen || mobilePage === "filters"}
                  aria-label="Фильтры поиска"
                  onClick={() => {
                    if (isMobile) {
                      popupRef.current?.focus({ preventScroll: true });
                      setMobilePage("filters");
                    } else setFiltersOpen(!filtersOpen);
                  }}
                  className={cn(
                    "col-start-2 row-start-1 h-11 justify-self-end rounded-lg px-3 text-sm md:col-start-3 md:h-10",
                    filtersOpen && "border-transparent bg-primary-soft text-primary",
                  )}
                >
                  <SlidersHorizontal className="mr-1 size-4" />
                  Фильтры{chips.length > 0 && <span className="ml-1 text-xs">{chips.length}</span>}
                </Button>
                {form.scope === "range" && (
                  <div className="col-span-2 md:col-span-3">
                    <SearchDateRange form={form} onChange={update} />
                  </div>
                )}
              </div>
              {chips.length > 0 && (
                <div className="flex max-h-28 shrink-0 flex-wrap items-center gap-2 overflow-y-auto px-5 py-3 md:px-[22px]">
                  {chips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      aria-label={`Убрать фильтр: ${chip.label}`}
                      onClick={() => update(chip.reset)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary-soft px-2.5 text-left text-xs text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8"
                    >
                      <span className="line-clamp-2">{chip.label}</span>
                      <X className="size-3.5 shrink-0" aria-hidden="true" />
                    </button>
                  ))}
                  <Button
                    variant="ghost"
                    onClick={resetFilters}
                    className="ml-auto min-h-11 rounded-lg text-xs text-muted-foreground md:min-h-8"
                  >
                    Сбросить
                  </Button>
                </div>
              )}
              {data.error && !filtersOpen && (
                <p role="alert" className="px-5 py-2 text-sm text-destructive">
                  {data.error}
                </p>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {filtersOpen && <div className="px-[22px] pt-3 pb-1">{filterPanel}</div>}
                {!data.ready ? (
                  <SearchHistory
                    history={history}
                    onRepeat={(entry) => {
                      setForm(entry);
                      resetScroll();
                    }}
                    onRemove={(index) => {
                      const next = history.filter((_, item) => index !== item);
                      setHistory(next);
                      writeSearchHistory(ownerId, next);
                    }}
                    onClear={() => {
                      setHistory([]);
                      writeSearchHistory(ownerId, []);
                    }}
                  />
                ) : data.error ? null : data.loading ? (
                  <SearchLoading />
                ) : failed || !items.length ? (
                  <SearchEmpty
                    error={failed}
                    hasFilters={chips.length > 0}
                    suggestion={page?.suggestion}
                    onReset={resetFilters}
                    onSuggestion={(q) => update({ q })}
                    onRetry={() => void data.results.refetch()}
                  />
                ) : (
                  <div
                    className={cn(
                      "grid min-h-0 grid-cols-1",
                      filtersOpen ? "h-auto" : "h-full",
                      !filtersOpen && "md:grid-cols-[minmax(0,1.32fr)_minmax(0,1fr)]",
                    )}
                  >
                    <div
                      ref={scrollRef}
                      onScroll={(event) => {
                        savedScroll.current = event.currentTarget.scrollTop;
                      }}
                      className={cn(
                        "min-h-0 overflow-y-auto px-5 py-4 md:px-3 md:py-5",
                        !filtersOpen && "md:border-r",
                      )}
                    >
                      <p
                        role="status"
                        className="mb-3 text-[11px] font-medium text-muted-foreground md:px-3"
                      >
                        НАЙДЕНО · {page?.total ?? 0}
                        {!!page?.counts.goals &&
                          !!page?.counts.entries &&
                          ` · Цели: ${page.counts.goals}, записи: ${page.counts.entries}`}
                      </p>
                      {data.results.isRefetchError && (
                        <div
                          role="alert"
                          className="mb-3 flex items-center justify-between gap-3 text-sm text-destructive"
                        >
                          <p>Не удалось обновить результаты.</p>
                          <Button
                            variant="outline"
                            onClick={() => void data.results.refetch()}
                            className="h-11 rounded-lg text-sm"
                          >
                            Повторить
                          </Button>
                        </div>
                      )}
                      <div
                        id={`${id}-results`}
                        role="listbox"
                        aria-label="Результаты поиска"
                        aria-busy={data.results.isFetching}
                      >
                        {items.map((result, index) => (
                          <SearchResultRow
                            key={result.id}
                            id={`${id}-result-${index}`}
                            result={result}
                            query={form.q}
                            selected={result.id === selected?.id}
                            onSelect={() => select(result)}
                          />
                        ))}
                      </div>
                      {data.results.hasNextPage && (
                        <Button
                          variant="outline"
                          isLoading={data.results.isFetchingNextPage}
                          loadingLabel="Загружаем результаты…"
                          onClick={() => void data.results.fetchNextPage()}
                          className="mt-4 h-11 w-full rounded-lg text-sm"
                        >
                          Показать ещё
                        </Button>
                      )}
                      {data.results.isFetchNextPageError && (
                        <p role="alert" className="mt-2 text-xs text-destructive">
                          Не удалось загрузить следующую страницу. Повторите попытку.
                        </p>
                      )}
                    </div>
                    {!isMobile && !filtersOpen && selected && (
                      <div className="hidden min-h-0 p-7 md:block">
                        <SearchPreview
                          result={selected}
                          query={form.q}
                          onOpen={() => openResult(selected)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <footer className="hidden h-[50px] shrink-0 items-center gap-5 border-t px-[22px] text-xs text-muted-foreground md:flex">
                <span>
                  <kbd className="mr-2 rounded bg-secondary px-2 py-1 text-foreground">↑ ↓</kbd>
                  Выбрать
                </span>
                <span>
                  <kbd className="mr-2 rounded bg-secondary px-2 py-1 text-foreground">Enter</kbd>
                  Открыть в плане
                </span>
                <span className="ml-auto">
                  <kbd className="mr-2">Esc</kbd>Закрыть
                </span>
              </footer>
            </>
          )}
          {isMobile && mobilePage === "preview" && selected && (
            <div className="min-h-0 flex-1 px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
              <SearchPreview
                titleRef={previewTitle}
                result={selected}
                query={form.q}
                onOpen={() => openResult(selected)}
              />
            </div>
          )}
          {isMobile && mobilePage === "filters" && (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-3">
                <SearchScope form={form} month={month} onChange={update} hideLabel={false} />
                <SearchDateRange form={form} onChange={update} />
                {filterPanel}
              </div>
              <div className="shrink-0 space-y-3 border-t px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
                <p className="text-center text-xs text-muted-foreground">
                  Условия применяются автоматически
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={resetFilters}
                    className="h-11 rounded-lg px-4 text-sm"
                  >
                    Сбросить
                  </Button>
                  <Button onClick={returnToResults} className="h-11 flex-1 rounded-lg text-sm">
                    К результатам{usable && page ? ` · ${page.total}` : ""}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
