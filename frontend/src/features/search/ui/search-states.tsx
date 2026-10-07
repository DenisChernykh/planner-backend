import { CloudOff, History, Search, SearchX, X } from "lucide-react";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { Button, Skeleton, Spinner } from "@/shared/ui";
import type { SearchForm } from "../model/search-form";

export function SearchHistory({
  history,
  onRepeat,
  onRemove,
  onClear,
}: {
  history: SearchForm[];
  onRepeat: (form: SearchForm) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
}) {
  return (
    <div className="px-5 py-6 md:px-6 md:py-7">
      {history.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[11px] font-medium text-muted-foreground">НЕДАВНИЕ ЗАПРОСЫ</h2>
            <Button
              variant="ghost"
              onClick={onClear}
              className="min-h-11 rounded-lg text-xs text-muted-foreground md:min-h-8"
            >
              Очистить историю
            </Button>
          </div>
          <ul>
            {history.map((form, index) => (
              <li
                key={JSON.stringify(form)}
                className="flex items-center gap-1 border-b last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => onRepeat(form)}
                  className="flex min-h-15 min-w-0 flex-1 items-center gap-3 rounded-lg py-3 text-left outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <History className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm">{form.q}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                    {form.scope === "all"
                      ? "Все месяцы"
                      : form.scope === "month"
                        ? formatPlannerMonth(form.from.slice(0, 7))
                        : `${form.from} — ${form.to}`}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  aria-label={`Удалить запрос «${form.q}»`}
                  onClick={() => onRemove(index)}
                  className="size-11 rounded-lg text-muted-foreground"
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex gap-4 px-1 py-10 text-sm leading-relaxed text-muted-foreground md:px-4">
        <Search className="mt-1 size-5 shrink-0" aria-hidden="true" />
        <div className="space-y-2">
          <p>Ищите цель по названию или запись по тексту заметки.</p>
          <p>Для поиска по датам и значениям используйте фильтры.</p>
        </div>
      </div>
    </div>
  );
}

export function SearchLoading() {
  return (
    <div role="status" className="space-y-5 p-6">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        Ищем записи…
      </p>
      {["first", "second", "third"].map((key) => (
        <div key={key} className="flex items-center gap-3 py-3">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchEmpty({
  error,
  hasFilters,
  suggestion,
  onReset,
  onSuggestion,
  onRetry,
}: {
  error: boolean;
  hasFilters: boolean;
  suggestion?: string | null;
  onReset: () => void;
  onSuggestion: (query: string) => void;
  onRetry: () => void;
}) {
  const Icon = error ? CloudOff : SearchX;
  return (
    <div
      className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 py-10 text-center"
      role={error ? "alert" : "status"}
    >
      <Icon className="mb-2 size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-lg font-semibold">
        {error ? "Не удалось загрузить результаты" : "Ничего не найдено"}
      </h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {error
          ? "Запрос и фильтры сохранены. Попробуйте ещё раз."
          : "Проверьте запрос или измените условия поиска."}
      </p>
      {suggestion && (
        <Button
          variant="link"
          onClick={() => onSuggestion(suggestion)}
          className="min-h-11 whitespace-normal text-sm"
        >
          Возможно, вы искали «{suggestion}»?
        </Button>
      )}
      {error ? (
        <Button onClick={onRetry} className="mt-2 h-11 rounded-lg px-4 text-sm">
          Повторить
        </Button>
      ) : (
        hasFilters && (
          <Button onClick={onReset} className="mt-2 h-11 rounded-lg px-4 text-sm">
            Сбросить фильтры
          </Button>
        )
      )}
    </div>
  );
}
