import { ChevronDown } from "lucide-react";
import { useId } from "react";
import type { SearchGoal } from "@/shared/api";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { Button, Input } from "@/shared/ui";
import {
  cadenceLabels,
  changeSearchScope,
  comparisonLabels,
  goalUnit,
  type SearchForm,
  trackingLabels,
} from "../model/search-form";

export function SearchSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  className = "",
  hideLabel = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className={`min-w-0 ${className}`} data-search-control>
      <label
        htmlFor={id}
        className={hideLabel ? "sr-only" : "mb-1.5 block text-xs text-muted-foreground"}
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="h-11 w-full appearance-none truncate rounded-lg border border-input bg-background pr-9 pl-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:h-10"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </div>
  );
}

export function SearchScope({
  form,
  month,
  onChange,
  hideLabel = true,
}: {
  form: SearchForm;
  month: string;
  onChange: (patch: Partial<SearchForm>) => void;
  hideLabel?: boolean;
}) {
  return (
    <SearchSelect
      label="Область поиска"
      hideLabel={hideLabel}
      value={form.scope}
      onChange={(scope) => onChange(changeSearchScope(scope as SearchForm["scope"], month))}
      options={[
        { value: "all", label: "Все месяцы" },
        {
          value: "month",
          label:
            form.scope === "month" ? formatPlannerMonth(form.from.slice(0, 7)) : "Открытый месяц",
        },
        { value: "range", label: "Диапазон дат" },
      ]}
    />
  );
}

export function SearchDateRange({
  form,
  onChange,
}: {
  form: SearchForm;
  onChange: (patch: Partial<SearchForm>) => void;
}) {
  const id = useId();
  if (form.scope !== "range") return null;
  return (
    <div className="grid grid-cols-2 gap-3" data-search-control>
      <div>
        <label htmlFor={`${id}-from`} className="mb-1.5 block text-xs text-muted-foreground">
          С даты
        </label>
        <Input
          id={`${id}-from`}
          type="date"
          value={form.from}
          max={form.to || undefined}
          onChange={(event) => onChange({ from: event.target.value })}
          className="h-11 rounded-lg bg-background text-sm md:h-10"
        />
      </div>
      <div>
        <label htmlFor={`${id}-to`} className="mb-1.5 block text-xs text-muted-foreground">
          По дату включительно
        </label>
        <Input
          id={`${id}-to`}
          type="date"
          value={form.to}
          min={form.from || undefined}
          onChange={(event) => onChange({ to: event.target.value })}
          className="h-11 rounded-lg bg-background text-sm md:h-10"
        />
      </div>
    </div>
  );
}

const choices = (labels: Record<string, string>, any = "Любое") => [
  { value: "any", label: any },
  ...Object.entries(labels).map(([value, label]) => ({ value, label })),
];

export function SearchFilters({
  form,
  goals,
  onChange,
  loading,
  failed,
  onRetry,
  error,
}: {
  form: SearchForm;
  goals: SearchGoal[];
  onChange: (patch: Partial<SearchForm>) => void;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  error: string | null;
}) {
  const id = useId();
  const goal = goals.find((item) => item.id === form.goalId);
  const missing = form.presence === "missing";
  const time = goal?.tracking.type === "time";
  const available = goals.filter(
    (item) =>
      (form.tracking === "any" || item.tracking.type === form.tracking) &&
      (form.cadence === "any" || item.cadence.period === form.cadence),
  );
  const numeric = goal?.tracking.type !== "check";
  return (
    <div className="space-y-3 rounded-lg md:bg-secondary md:p-4" data-search-control>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 md:grid-cols-3 md:gap-3">
        <SearchSelect
          label="Тип учёта"
          value={form.tracking}
          options={choices(trackingLabels, "Любой")}
          onChange={(tracking) => onChange({ tracking: tracking as SearchForm["tracking"] })}
        />
        <SearchSelect
          label="Периодичность"
          value={form.cadence}
          options={choices(cadenceLabels, "Любая")}
          onChange={(cadence) => onChange({ cadence: cadence as SearchForm["cadence"] })}
        />
        <SearchSelect
          label="Наличие записи"
          value={form.presence}
          options={choices({ present: "Есть запись", missing: "Нет записи" })}
          onChange={(presence) => onChange({ presence: presence as SearchForm["presence"] })}
        />
        <SearchSelect
          label="Выполнение"
          value={form.met}
          disabled={missing}
          options={choices({ met: "Выполнено", unmet: "Не выполнено" })}
          onChange={(met) => onChange({ met: met as SearchForm["met"] })}
        />
        <SearchSelect
          label="Заметка"
          value={form.note}
          disabled={missing}
          options={choices({ present: "Есть заметка", absent: "Нет заметки" }, "Любая")}
          onChange={(note) => onChange({ note: note as SearchForm["note"] })}
        />
        <SearchSelect
          label="Цель"
          className="order-first col-span-2 md:order-none md:col-span-1"
          value={form.goalId}
          disabled={loading || failed}
          options={[
            { value: "", label: loading ? "Загружаем цели…" : "Любая цель" },
            ...available.map((item) => ({
              value: item.id,
              label: `${item.title} · ${formatPlannerMonth(item.month)}${item.deletedAt !== null ? " · удалена" : ""}`,
            })),
          ]}
          onChange={(goalId) => onChange({ goalId })}
        />
        {numeric && (
          <>
            <SearchSelect
              label="Сравнение"
              value={form.comparison}
              disabled={!goal || missing}
              options={choices(
                time
                  ? { lt: "Раньше", gt: "Позже", eq: "В указанное время", between: "Интервал" }
                  : comparisonLabels,
              )}
              onChange={(comparison) =>
                onChange({ comparison: comparison as SearchForm["comparison"] })
              }
            />
            <div className="min-w-0">
              <label htmlFor={`${id}-value`} className="mb-1.5 block text-xs text-muted-foreground">
                {form.comparison === "between" ? "От (включительно)" : "Значение"}
                {goalUnit(goal) ? `, ${goalUnit(goal)}` : ""}
              </label>
              <Input
                id={`${id}-value`}
                type={time ? "time" : "text"}
                inputMode={time ? undefined : "decimal"}
                maxLength={64}
                disabled={!goal || missing || form.comparison === "any"}
                value={form.value}
                onChange={(event) => onChange({ value: event.target.value })}
                className="h-11 rounded-lg bg-background text-sm md:h-10"
              />
            </div>
            {form.comparison === "between" && (
              <div className="min-w-0">
                <label
                  htmlFor={`${id}-upper`}
                  className="mb-1.5 block text-xs text-muted-foreground"
                >
                  До (включительно)
                </label>
                <Input
                  id={`${id}-upper`}
                  type={time ? "time" : "text"}
                  inputMode={time ? undefined : "decimal"}
                  maxLength={64}
                  value={form.valueTo}
                  onChange={(event) => onChange({ valueTo: event.target.value })}
                  className="h-11 rounded-lg bg-background text-sm md:h-10"
                />
              </div>
            )}
          </>
        )}
        <label className="col-span-2 flex min-h-11 items-center gap-2.5 self-end text-sm md:col-span-1 md:min-h-10">
          <input
            type="checkbox"
            checked={form.includeDeleted}
            onChange={(event) => onChange({ includeDeleted: event.target.checked })}
            className="size-4 accent-primary"
          />
          Включить удалённые
        </label>
      </div>
      {missing && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Только прошедшие дни и сегодня. Выполнение, заметка и значение недоступны без записи.
          Запрос ищет название и описание цели.
        </p>
      )}
      {!goal && !missing && (
        <p className="text-xs text-muted-foreground">
          Для сравнения значения выберите конкретную цель.
        </p>
      )}
      {failed && (
        <div role="alert" className="flex items-center gap-2 text-xs text-destructive">
          Не удалось загрузить цели.
          <Button variant="ghost" onClick={onRetry}>
            Повторить
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="hidden text-xs text-muted-foreground md:block">
        Результаты обновляются автоматически
      </p>
    </div>
  );
}
