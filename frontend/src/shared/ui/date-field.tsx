import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  addPlannerDays,
  addPlannerMonth,
  formatPlannerDay,
  getPlannerMonthEnd,
  getPlannerWeekStart,
} from "@/shared/lib/planner-calendar";
import { formatPlannerMonth } from "@/shared/lib/planner-month";
import { Button } from "./button";
import { TextField } from "./text-field";

export function isCivilDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function DateField({
  label,
  value,
  onChange,
  disabled = false,
  expanded = false,
  today,
  description,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  expanded?: boolean;
  today: string;
  description?: string;
}) {
  const [open, setOpen] = useState(expanded);
  const [month, setMonth] = useState((isCivilDate(value) ? value : today).slice(0, 7));
  const [focused, setFocused] = useState(isCivilDate(value) ? value : today);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const keyboardFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const date = keyboardFocus.current;
    if (!date || date !== focused || date.slice(0, 7) !== month) return;
    const button = buttons.current.get(date);
    if (button) {
      keyboardFocus.current = null;
      button.focus();
    }
  }, [month, focused]);
  const id = useId();
  const start = getPlannerWeekStart(`${month}-01`);
  const last = getPlannerMonthEnd(month);
  const count =
    Math.round((Date.parse(`${last}T12:00Z`) - Date.parse(`${start}T12:00Z`)) / 86400000) + 1;
  const days = Array.from({ length: count }, (_, index) => addPlannerDays(start, index));
  const invalid = value !== "" && !isCivilDate(value);
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <div className="flex items-end gap-2 [&_[data-slot=field]]:min-w-0 [&_[data-slot=field]]:flex-1">
        <TextField
          label={label}
          value={value}
          placeholder="ГГГГ-ММ-ДД"
          aria-invalid={invalid}
          aria-describedby={
            [invalid ? `${id}-error` : "", description ? `${id}-description` : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onChange={(event) => {
            onChange(event.target.value);
            if (isCivilDate(event.target.value)) {
              setMonth(event.target.value.slice(0, 7));
              setFocused(event.target.value);
            }
          }}
        />
        {!expanded && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-11 w-11 shrink-0"
            aria-label={open ? "Скрыть календарь" : "Выбрать в календаре"}
            aria-expanded={open}
            aria-controls={`${id}-calendar`}
            onClick={() => setOpen(!open)}
          >
            <CalendarDays />
          </Button>
        )}
      </div>
      {description && (
        <p id={`${id}-description`} className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {invalid && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          Укажите существующую дату в формате ГГГГ-ММ-ДД.
        </p>
      )}
      {open && (
        <fieldset id={`${id}-calendar`} className="space-y-3" aria-label="Календарь выбора даты">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label="Предыдущий месяц календаря"
              onClick={() => {
                setMonth(addPlannerMonth(month, -1));
                setFocused(`${addPlannerMonth(month, -1)}-01`);
              }}
            >
              <ChevronLeft />
            </Button>
            <span className="text-sm font-semibold" aria-live="polite">
              {formatPlannerMonth(month)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label="Следующий месяц календаря"
              onClick={() => {
                setMonth(addPlannerMonth(month, 1));
                setFocused(`${addPlannerMonth(month, 1)}-01`);
              }}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
              <span key={day} className="py-1 text-center text-xs text-muted-foreground">
                {day}
              </span>
            ))}
            {days.map((date) =>
              date.slice(0, 7) !== month ? (
                <span key={date} />
              ) : (
                <button
                  key={date}
                  type="button"
                  ref={(button) => {
                    if (button) buttons.current.set(date, button);
                    else buttons.current.delete(date);
                  }}
                  tabIndex={focused === date ? 0 : -1}
                  aria-label={`${formatPlannerDay(date)} ${date.slice(0, 4)}`}
                  aria-pressed={value === date}
                  aria-current={date === today ? "date" : undefined}
                  className={`min-h-9 rounded-lg text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary ${value === date ? "bg-primary text-primary-foreground" : date === today ? "border border-primary" : "hover:bg-muted"}`}
                  onFocus={() => setFocused(date)}
                  onClick={() => {
                    onChange(date);
                    setFocused(date);
                  }}
                  onKeyDown={(event) => {
                    const offsets: Record<string, number> = {
                      ArrowLeft: -1,
                      ArrowRight: 1,
                      ArrowUp: -7,
                      ArrowDown: 7,
                    };
                    const next =
                      event.key in offsets
                        ? addPlannerDays(date, offsets[event.key] ?? 0)
                        : event.key === "Home"
                          ? getPlannerWeekStart(date)
                          : event.key === "End"
                            ? addPlannerDays(getPlannerWeekStart(date), 6)
                            : null;
                    if (!next) return;
                    event.preventDefault();
                    keyboardFocus.current = next;
                    setMonth(next.slice(0, 7));
                    setFocused(next);
                  }}
                >
                  {Number(date.slice(8))}
                </button>
              ),
            )}
          </div>
        </fieldset>
      )}
    </fieldset>
  );
}
